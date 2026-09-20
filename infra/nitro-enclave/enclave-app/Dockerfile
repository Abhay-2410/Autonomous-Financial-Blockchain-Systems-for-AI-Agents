FROM public.ecr.aws/amazonlinux/amazonlinux:2023 AS builder

RUN dnf install -y gcc make openssl-devel git tar gzip \
    && dnf clean all

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.83.0
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /build
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release && strip target/release/enclave-app

FROM public.ecr.aws/amazonlinux/amazonlinux:2023

RUN dnf install -y ca-certificates && dnf clean all

COPY --from=builder /build/target/release/enclave-app /usr/local/bin/enclave-app

ENV VSOCK_PORT=5000 \
    KMS_PROXY_PORT=8000 \
    RUST_LOG=enclave_app=info \
    AWS_REGION=eu-north-1

CMD ["/usr/local/bin/enclave-app"]
