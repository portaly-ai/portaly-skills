#!/usr/bin/env python3

import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import sys
from typing import Any, Optional


_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_SUPPORTED_KEY_ORDER = tuple(
    """
    absent allocatedAmount alpha amount appliedDiscount appliesTo beta
    billingPeriod bundleId buyerEmail buyerName campaign cancelAtPeriodEnd
    canceledAt cancelEffectiveAt cancelReason cancelReasonNote
    cancelRequestedAt cancelRequestedBy carrierNumber carrierType cart_id
    chargedAt checkoutSessionId child code codeId company companyId completedAt
    currency currentPeriodStartedAt customerEmail customerName cycles discount
    discountedAmount duration empty enabled event failedAt failureCount
    failureReason finalAmount flags invoice lastChargedAt lastFailureAt
    lastFailureReason lastPaymentReference list merchantConsumerId
    merchantOrderNumber metadata mode negative nested nextBillingAt nextRetryAt
    orderId orders orderSuccessPageUrl originalAmount paymentId paymentMethod
    paymentReference planId planIds productId productName profileId refundedAt
    rule sessionId source status subscriptionId totalAmount type value willCancel
    zebra zero zeta
    """.split()
)
_SUPPORTED_KEY_RANK = {key: index for index, key in enumerate(_SUPPORTED_KEY_ORDER)}


class UnsupportedV1Payload(ValueError):
    """Raised instead of silently guessing JavaScript v1 serialization."""


def _validate_supported_key(key: Any) -> str:
    """Accept only keys whose production localeCompare rank is committed."""

    if not isinstance(key, str) or key not in _SUPPORTED_KEY_RANK:
        raise UnsupportedV1Payload(
            f"Python v1 adapter has no committed production ordering for key {key!r}. "
            "Use Node/WebCrypto for arbitrary metadata keys, or add a "
            "production-derived vector before extending the native adapter."
        )
    return key


def _validate_string(value: str) -> str:
    if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
        raise UnsupportedV1Payload(
            "Python v1 adapter rejects unpaired Unicode surrogates. "
            "Use Node/WebCrypto for this payload."
        )
    return value


def stable_json(value: Any) -> str:
    if isinstance(value, list):
        return "[" + ",".join(stable_json(item) for item in value) + "]"

    if isinstance(value, dict):
        keys = [_validate_supported_key(key) for key in value]
        keys.sort(key=_SUPPORTED_KEY_RANK.__getitem__)
        return (
            "{"
            + ",".join(
                f"{json.dumps(key, ensure_ascii=False)}:{stable_json(value[key])}"
                for key in keys
            )
            + "}"
        )

    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        if abs(value) > _MAX_SAFE_INTEGER:
            raise UnsupportedV1Payload(
                "Python v1 adapter rejects integers outside JavaScript's safe "
                "integer range. Use Node/WebCrypto or a proven native adapter."
            )
        return str(value)
    if isinstance(value, float):
        raise UnsupportedV1Payload(
            "Python v1 adapter does not guess JavaScript floating-point JSON "
            "formatting. Use Node/WebCrypto or a proven native adapter."
        )
    if isinstance(value, str):
        return json.dumps(
            _validate_string(value), ensure_ascii=False, separators=(",", ":")
        )

    raise UnsupportedV1Payload(f"Unsupported JSON value type: {type(value).__name__}")


def sign_callback(secret: str, payload: Any, timestamp: str) -> str:
    base_string = f"{timestamp}.{stable_json(payload)}"
    return hmac.new(
        secret.encode("utf-8"),
        base_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_callback(
    secret: str,
    payload: Any,
    timestamp: str,
    signature: str,
) -> bool:
    expected = sign_callback(secret, payload, timestamp)
    return hmac.compare_digest(expected, signature)


def _parse_payload(payload_file: Optional[str]) -> Any:
    raw = (
        Path(payload_file).read_text(encoding="utf-8")
        if payload_file
        else sys.stdin.read()
    )
    if not raw.strip():
        raise ValueError("Provide the JSON payload on stdin or with --payload-file.")
    return json.loads(
        raw,
        parse_constant=lambda value: (_ for _ in ()).throw(
            ValueError(f"Non-standard JSON number is unsupported: {value}")
        ),
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate or verify Portaly callback v1 signatures."
    )
    parser.add_argument("--timestamp", required=True, help="x-portaly-timestamp")
    parser.add_argument("--payload-file", help="JSON file; otherwise read stdin")
    parser.add_argument("--signature", help="Expected x-portaly-signature")
    args = parser.parse_args()

    secret = os.environ.get("PORTALY_CALLBACK_SECRET")
    if not secret:
        parser.error("Set PORTALY_CALLBACK_SECRET in the server environment.")

    payload = _parse_payload(args.payload_file)
    generated = sign_callback(secret, payload, args.timestamp)
    print(generated)

    if args.signature is not None:
        if verify_callback(secret, payload, args.timestamp, args.signature):
            print("verified")
        else:
            print("invalid")
            raise SystemExit(1)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2) from error
