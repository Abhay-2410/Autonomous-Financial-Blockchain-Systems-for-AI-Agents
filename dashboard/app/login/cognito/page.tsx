import { Suspense } from "react";
import CognitoCallbackClient from "./CognitoCallbackClient";

export default function CognitoCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center text-sm text-[#5c6b63]">
          Finishing Cognito sign-in…
        </div>
      }
    >
      <CognitoCallbackClient />
    </Suspense>
  );
}
