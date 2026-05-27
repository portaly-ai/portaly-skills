#!/usr/bin/env python3

import argparse
import hashlib
import hmac
import json
from typing import Any


def stable_json(value: Any) -> str:
    if isinstance(value, list):
        return "[" + ",".join(stable_json(item) for item in value) + "]"
    if isinstance(value, dict):
        items = sorted(value.items(), key=lambda item: item[0])
        return (
            "{"
            + ",".join(
                f"{json.dumps(key, ensure_ascii=False)}:{stable_json(val)}"
                for key, val in items
            )
            + "}"
        )
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def sign_callback(secret: str, payload: Any, timestamp: str) -> str:
    base_string = f"{timestamp}.{stable_json(payload)}"
    return hmac.new(
        secret.encode("utf-8"),
        base_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate or verify Portaly Vibe Payment callback signatures."
    )
    parser.add_argument("--secret", required=True, help="callbackSecret")
    parser.add_argument("--timestamp", required=True, help="x-portaly-timestamp")
    parser.add_argument("--payload", required=True, help="Raw JSON payload string")
    parser.add_argument("--signature", help="Expected x-portaly-signature")
    args = parser.parse_args()

    payload = json.loads(args.payload)
    generated = sign_callback(args.secret, payload, args.timestamp)

    print(generated)

    if args.signature is not None:
        if hmac.compare_digest(generated, args.signature):
            print("verified")
        else:
            print("invalid")
            raise SystemExit(1)


if __name__ == "__main__":
    main()
