FROM public.ecr.aws/amazonlinux/amazonlinux:2023 AS builder
RUN dnf install -y gcc make openssl-devel tar gzip \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.83.0
ENV PATH="/root/.cargo/bin:${PATH}"
WORKDIR /build
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release && strip target/release/limitx-parent-proxy

FROM public.ecr.aws/amazonlinux/amazonlinux:2023
RUN dnf install -y ca-certificates && dnf clean all
# nitro-cli lives on the host image; binary talks to it via PATH when installed on host
COPY --from=builder /build/target/release/limitx-parent-proxy /usr/local/bin/limitx-parent-proxy
ENV BIND_ADDR=0.0.0.0:8443 \
    ENCLAVE_VSOCK_PORT=5000 \
    RUST_LOG=limitx_parent_proxy=info
EXPOSE 8443
CMD ["/usr/local/bin/limitx-parent-proxy"]
