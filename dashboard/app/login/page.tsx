import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center text-sm text-[#5c6b63]">
          Opening LimitX…
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
