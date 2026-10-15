import { describe, expect, it } from "vitest";
import { decodeJwtPayload, emailFromMicrosoftClaims, SUNWAY_TENANTS } from "@/lib/microsoft";

const IMAIL = "537c2be1-fcd4-45a9-83b3-6653eacc5070";
const STAFF = "051008eb-db40-4249-9ece-9df3e8c3f594";
const OTHER = "11111111-2222-3333-4444-555555555555";
const opts = {
  clientId: "client-1",
  nonce: "n-123",
  allowedDomains: ["imail.sunway.edu.my", "sunway.edu.my"],
  adminEmail: "owner@gmail.com",
  now: 1_700_000_000_000,
};

function claims(over: Record<string, unknown> = {}) {
  return {
    iss: `https://login.microsoftonline.com/${IMAIL}/v2.0`,
    aud: "client-1",
    tid: IMAIL,
    nonce: "n-123",
    exp: 1_700_000_000 + 3600,
    preferred_username: "21012345@IMAIL.sunway.edu.my",
    ...over,
  };
}

describe("Microsoft sign-in claims", () => {
  it("accepts a Sunway student account and returns the normalised email", () => {
    expect(emailFromMicrosoftClaims(claims(), opts)).toBe("21012345@imail.sunway.edu.my");
  });

  it("accepts a staff account from the staff directory", () => {
    const c = claims({ tid: STAFF, iss: `https://login.microsoftonline.com/${STAFF}/v2.0`, preferred_username: "jane@sunway.edu.my" });
    expect(emailFromMicrosoftClaims(c, opts)).toBe("jane@sunway.edu.my");
  });

  it("rejects other organisations, even when they claim a Sunway address", () => {
    const c = claims({ tid: OTHER, iss: `https://login.microsoftonline.com/${OTHER}/v2.0` });
    expect(() => emailFromMicrosoftClaims(c, opts)).toThrow(/not a Sunway/);
  });

  it("only lets each directory vouch for its own domain", () => {
    expect(() => emailFromMicrosoftClaims(claims({ preferred_username: "jane@sunway.edu.my" }), opts)).toThrow(/domain/);
    expect(() => emailFromMicrosoftClaims(claims({ preferred_username: "x@imail.sunway.edu.my.evil.com" }), opts)).toThrow(/domain/);
  });

  it("checks issuer, audience, nonce and expiry", () => {
    expect(() => emailFromMicrosoftClaims(claims({ iss: "https://login.microsoftonline.com/common/v2.0" }), opts)).toThrow(/issuer/);
    expect(() => emailFromMicrosoftClaims(claims({ aud: "someone-else" }), opts)).toThrow(/audience/);
    expect(() => emailFromMicrosoftClaims(claims({ nonce: "other" }), opts)).toThrow(/nonce/);
    expect(() => emailFromMicrosoftClaims(claims({ exp: 1_699_990_000 }), opts)).toThrow(/expired/);
  });

  it("ignores the editable email claim and needs preferred_username", () => {
    expect(() => emailFromMicrosoftClaims(claims({ preferred_username: undefined, email: "21012345@imail.sunway.edu.my" }), opts)).toThrow(/username/);
  });

  it("never signs in the admin account and respects ALLOWED_EMAIL_DOMAINS", () => {
    const adminOpts = { ...opts, adminEmail: "21012345@imail.sunway.edu.my" };
    expect(() => emailFromMicrosoftClaims(claims(), adminOpts)).toThrow(/admin/);
    expect(() => emailFromMicrosoftClaims(claims(), { ...opts, allowedDomains: ["sunway.edu.my"] })).toThrow(/not allowed/);
  });

  it("does not treat prototype keys as tenants and decodes tokens safely", () => {
    expect(() => emailFromMicrosoftClaims(claims({ tid: "__proto__" }), opts)).toThrow(/not a Sunway/);
    expect(Object.keys(SUNWAY_TENANTS)).toHaveLength(2);
    const token = ["e30", Buffer.from(JSON.stringify(claims())).toString("base64url"), "sig"].join(".");
    expect(decodeJwtPayload(token).tid).toBe(IMAIL);
    expect(() => decodeJwtPayload("not-a-jwt")).toThrow();
  });
});
