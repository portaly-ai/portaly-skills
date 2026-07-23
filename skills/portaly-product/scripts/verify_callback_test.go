package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

type vectorFile struct {
	Vectors []signatureVector `json:"vectors"`
}

type signatureVector struct {
	ID         string          `json:"id"`
	Secret     string          `json:"secret"`
	Timestamp  string          `json:"timestamp"`
	Payload    json.RawMessage `json:"payload"`
	StableJSON string          `json:"stableJson"`
	Signature  string          `json:"signature"`
}

func decodePayload(t *testing.T, raw json.RawMessage) any {
	t.Helper()
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	var payload any
	if err := decoder.Decode(&payload); err != nil {
		t.Fatal(err)
	}
	return payload
}

func loadVectors(t *testing.T) []signatureVector {
	t.Helper()
	raw, err := os.ReadFile("../references/callback-signature-v1-vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture vectorFile
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	return fixture.Vectors
}

func TestProductionDerivedVectors(t *testing.T) {
	for _, vector := range loadVectors(t) {
		vector := vector
		t.Run(vector.ID, func(t *testing.T) {
			payload := decodePayload(t, vector.Payload)
			serialized, err := stableJSON(payload)
			if err != nil {
				t.Fatal(err)
			}
			if serialized != vector.StableJSON {
				t.Fatalf("stable JSON mismatch\nwant: %s\n got: %s", vector.StableJSON, serialized)
			}

			signature, err := signPortalyCallback(vector.Secret, payload, vector.Timestamp)
			if err != nil {
				t.Fatal(err)
			}
			if signature != vector.Signature {
				t.Fatalf("signature mismatch: want %s, got %s", vector.Signature, signature)
			}

			verified, err := verifyPortalyCallback(
				vector.Secret,
				payload,
				vector.Timestamp,
				vector.Signature,
			)
			if err != nil || !verified {
				t.Fatalf("valid signature rejected: verified=%v err=%v", verified, err)
			}

			wrongSecret, err := verifyPortalyCallback(
				vector.Secret+"_wrong",
				payload,
				vector.Timestamp,
				vector.Signature,
			)
			if err != nil || wrongSecret {
				t.Fatalf("wrong secret accepted: verified=%v err=%v", wrongSecret, err)
			}

			wrongTimestamp, err := verifyPortalyCallback(
				vector.Secret,
				payload,
				vector.Timestamp+"-wrong",
				vector.Signature,
			)
			if err != nil || wrongTimestamp {
				t.Fatalf("wrong timestamp accepted: verified=%v err=%v", wrongTimestamp, err)
			}

			negativeSignatures := []string{
				strings.ToUpper(vector.Signature),
				vector.Signature[:len(vector.Signature)-1],
				strings.Repeat("0", len(vector.Signature)),
			}
			for _, candidate := range negativeSignatures {
				verified, err := verifyPortalyCallback(
					vector.Secret,
					payload,
					vector.Timestamp,
					candidate,
				)
				if err != nil {
					t.Fatal(err)
				}
				if verified {
					t.Fatalf("invalid signature accepted: %s", candidate)
				}
			}
		})
	}
}

func TestFailsClosedOutsideProvenDomain(t *testing.T) {
	tests := []any{
		map[string]any{"non-ascii-鍵": "value"},
		map[string]any{"hyphen-key": "value"},
		map[string]any{"metadata": map[string]any{"unknown-key": "value"}},
		map[string]any{"metadata": map[string]any{"userId": "u_1", "cartId": "c_1"}},
		map[string]any{"amount": json.Number("1.25")},
		map[string]any{"amount": json.Number("9007199254740992")},
		map[string]any{"status": "contains � replacement"},
	}

	for _, payload := range tests {
		if _, err := stableJSON(payload); err == nil {
			t.Fatalf("expected unsupported payload to fail closed: %#v", payload)
		}
	}
}

func TestEmptySignatureIsRejected(t *testing.T) {
	vector := loadVectors(t)[0]
	payload := decodePayload(t, vector.Payload)
	verified, err := verifyPortalyCallback(vector.Secret, payload, vector.Timestamp, "")
	if err != nil {
		t.Fatal(err)
	}
	if verified {
		t.Fatal("empty signature was accepted")
	}
}
