import {
  emailFromCognitoClaims,
  isEmailVerifiedClaim,
  type CognitoIdClaims,
} from "./cognito";

describe("emailFromCognitoClaims", () => {
  it("prefers the email claim over cognito:username", () => {
    const claims: CognitoIdClaims = {
      sub: "f05c993c-e001-70fe-032f-ff832adf62f9",
      email: "you@example.com",
      "cognito:username": "f05c993c-e001-70fe-032f-ff832adf62f9",
      email_verified: true,
    };
    expect(emailFromCognitoClaims(claims)).toBe("you@example.com");
  });

  it("accepts cognito:username when it is an email (UsernameAttributes pool)", () => {
    const claims: CognitoIdClaims = {
      sub: "abc",
      "cognito:username": "Owner@Example.com",
    };
    expect(emailFromCognitoClaims(claims)).toBe("owner@example.com");
  });

  it("never treats a UUID username as an email", () => {
    const claims: CognitoIdClaims = {
      sub: "f05c993c-e001-70fe-032f-ff832adf62f9",
      "cognito:username": "f05c993c-e001-70fe-032f-ff832adf62f9",
    };
    expect(emailFromCognitoClaims(claims)).toBeUndefined();
  });

  it("parses email_verified claim", () => {
    expect(isEmailVerifiedClaim(true)).toBe(true);
    expect(isEmailVerifiedClaim("true")).toBe(true);
    expect(isEmailVerifiedClaim(false)).toBe(false);
    expect(isEmailVerifiedClaim(undefined)).toBe(false);
  });
});
