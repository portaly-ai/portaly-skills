package main

import (
	"bufio"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

const maxSafeInteger int64 = 9_007_199_254_740_991

var (
	integerJSON       = regexp.MustCompile(`^-?(0|[1-9][0-9]*)$`)
	supportedKeyOrder = []string{
		"absent", "allocatedAmount", "alpha", "amount", "appliedDiscount", "appliesTo",
		"beta", "billingPeriod", "bundleId", "buyerEmail", "buyerName", "campaign",
		"cancelAtPeriodEnd", "canceledAt", "cancelEffectiveAt", "cancelReason",
		"cancelReasonNote", "cancelRequestedAt", "cancelRequestedBy", "carrierNumber",
		"carrierType", "cart_id", "chargedAt", "checkoutSessionId", "child", "code",
		"codeId", "company", "companyId", "completedAt", "currency",
		"currentPeriodStartedAt", "customerEmail", "customerName", "cycles", "discount",
		"discountedAmount", "duration", "empty", "enabled", "event", "failedAt",
		"failureCount", "failureReason", "finalAmount", "flags", "invoice",
		"lastChargedAt", "lastFailureAt", "lastFailureReason", "lastPaymentReference",
		"list", "merchantConsumerId", "merchantOrderNumber", "metadata", "mode",
		"negative", "nested", "nextBillingAt", "nextRetryAt", "orderId", "orders",
		"orderSuccessPageUrl", "originalAmount", "paymentId", "paymentMethod",
		"paymentReference", "planId", "planIds", "productId", "productName", "profileId",
		"refundedAt", "rule", "sessionId", "source", "status", "subscriptionId",
		"totalAmount", "type", "value", "willCancel", "zebra", "zero", "zeta",
	}
	supportedKeyRank = func() map[string]int {
		ranks := make(map[string]int, len(supportedKeyOrder))
		for index, key := range supportedKeyOrder {
			ranks[key] = index
		}
		return ranks
	}()
)

func stableJSON(value any) (string, error) {
	switch typed := value.(type) {
	case nil:
		return "null", nil
	case bool:
		if typed {
			return "true", nil
		}
		return "false", nil
	case string:
		if strings.ContainsRune(typed, utf8.RuneError) {
			return "", errors.New(
				"Go v1 adapter rejects replacement characters and malformed Unicode; use Node/WebCrypto",
			)
		}
		return quoteJSONString(typed), nil
	case json.Number:
		return stableJSONNumber(typed)
	case []any:
		parts := make([]string, len(typed))
		for index, item := range typed {
			serialized, err := stableJSON(item)
			if err != nil {
				return "", err
			}
			parts[index] = serialized
		}
		return "[" + strings.Join(parts, ",") + "]", nil
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			if _, ok := supportedKeyRank[key]; !ok {
				return "", fmt.Errorf(
					"Go v1 adapter has no committed production ordering for key %q; use Node/WebCrypto for arbitrary metadata keys",
					key,
				)
			}
			keys = append(keys, key)
		}
		sort.SliceStable(keys, func(left, right int) bool {
			return supportedKeyRank[keys[left]] < supportedKeyRank[keys[right]]
		})

		parts := make([]string, len(keys))
		for index, key := range keys {
			serialized, err := stableJSON(typed[key])
			if err != nil {
				return "", err
			}
			parts[index] = quoteJSONString(key) + ":" + serialized
		}
		return "{" + strings.Join(parts, ",") + "}", nil
	default:
		return "", fmt.Errorf("unsupported JSON value type %T", value)
	}
}

func stableJSONNumber(value json.Number) (string, error) {
	raw := value.String()
	if !integerJSON.MatchString(raw) {
		return "", errors.New(
			"Go v1 adapter does not guess JavaScript floating-point JSON formatting; " +
				"use Node/WebCrypto or a proven native adapter",
		)
	}

	parsed, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || parsed < -maxSafeInteger || parsed > maxSafeInteger {
		return "", errors.New(
			"Go v1 adapter rejects integers outside JavaScript's safe integer range",
		)
	}
	return strconv.FormatInt(parsed, 10), nil
}

// quoteJSONString follows JSON.stringify string escaping for valid JSON input.
// It intentionally leaves HTML characters and U+2028/U+2029 unescaped.
func quoteJSONString(value string) string {
	var builder strings.Builder
	builder.Grow(len(value) + 2)
	builder.WriteByte('"')

	for _, character := range value {
		switch character {
		case '"':
			builder.WriteString(`\"`)
		case '\\':
			builder.WriteString(`\\`)
		case '\b':
			builder.WriteString(`\b`)
		case '\f':
			builder.WriteString(`\f`)
		case '\n':
			builder.WriteString(`\n`)
		case '\r':
			builder.WriteString(`\r`)
		case '\t':
			builder.WriteString(`\t`)
		default:
			if character < 0x20 {
				fmt.Fprintf(&builder, `\u%04x`, character)
			} else {
				builder.WriteRune(character)
			}
		}
	}

	builder.WriteByte('"')
	return builder.String()
}

func signPortalyCallback(secret string, payload any, timestamp string) (string, error) {
	serialized, err := stableJSON(payload)
	if err != nil {
		return "", err
	}

	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(timestamp + "." + serialized))
	return hex.EncodeToString(mac.Sum(nil)), nil
}

func verifyPortalyCallback(
	secret string,
	payload any,
	timestamp string,
	signature string,
) (bool, error) {
	expected, err := signPortalyCallback(secret, payload, timestamp)
	if err != nil {
		return false, err
	}
	return hmac.Equal([]byte(expected), []byte(signature)), nil
}

func readPayload(path string) (any, error) {
	var reader io.Reader = bufio.NewReader(os.Stdin)
	if path != "" {
		file, err := os.Open(path)
		if err != nil {
			return nil, err
		}
		defer file.Close()
		reader = file
	}

	decoder := json.NewDecoder(reader)
	decoder.UseNumber()
	var payload any
	if err := decoder.Decode(&payload); err != nil {
		return nil, err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, errors.New("payload must contain exactly one JSON value")
		}
		return nil, err
	}
	return payload, nil
}

func main() {
	timestamp := flag.String("timestamp", "", "x-portaly-timestamp")
	signature := flag.String("signature", "", "expected x-portaly-signature")
	payloadFile := flag.String("payload-file", "", "JSON file; otherwise read stdin")
	flag.Parse()
	signatureProvided := false
	flag.Visit(func(candidate *flag.Flag) {
		if candidate.Name == "signature" {
			signatureProvided = true
		}
	})

	secret := os.Getenv("PORTALY_CALLBACK_SECRET")
	if secret == "" || *timestamp == "" {
		fmt.Fprintln(
			os.Stderr,
			"set PORTALY_CALLBACK_SECRET and pass --timestamp; provide JSON on stdin or with --payload-file",
		)
		os.Exit(2)
	}

	payload, err := readPayload(*payloadFile)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	generated, err := signPortalyCallback(secret, payload, *timestamp)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	fmt.Println(generated)

	if signatureProvided {
		verified, err := verifyPortalyCallback(secret, payload, *timestamp, *signature)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(2)
		}
		if verified {
			fmt.Println("verified")
			return
		}
		fmt.Println("invalid")
		os.Exit(1)
	}
}
