# LimitX parent host (outside the enclave)

| Piece | Path | Role |
|---|---|---|
| vsock-proxy allowlist | `vsock-proxy.yaml` | **Only** `kms.<region>.amazonaws.com:443` |
| HTTP → vsock bridge | `proxy-service/` (Rust) | Private IP `:8443` for API Lambdas |
| Enclave launcher | `start-enclave.sh` | `nitro-cli run-enclave` (+ systemd restart) |
| systemd units | `systemd/*.service` | Boot + crash restart |

## Flow

```
Lambda authorizeAndSignViaEnclave
    → HTTP POST http://<private-ip>:8443/v1/sign
        → parent proxy opens vsock to enclave CID:5000
            → enclave-app re-checks policy + KMS Sign via vsock-proxy:8000
```

## Install (prefer deploy.sh)

See `../deploy.sh` — builds the EIF, installs units, starts enclave + proxies.
