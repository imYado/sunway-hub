import { describe, expect, it } from "vitest";
import { classifyEmail, isAdminEmail, isAllowedMemberEmail, normaliseEmail } from "@/lib/email-domain";

const domains = ["imail.sunway.edu.my", "sunway.edu.my"];
const admin = "mohammedalqadhi745@gmail.com";

describe("email domain matching", () => {
  it.each([
    "student@imail.sunway.edu.my",
    "STUDENT@IMAIL.SUNWAY.EDU.MY",
    "  lecturer@sunway.edu.my  ",
    "first.last+tag@imail.sunway.edu.my",
  ])("allows %s", (email) => {
    expect(isAllowedMemberEmail(email, domains)).toBe(true);
  });

  it.each([
    "student@imail.sunway.edu.my.evil.com",
    "student@xsunway.edu.my",
    "student@evil-sunway.edu.my",
    "student@sunway.edu.my.",
    "student@sub.sunway.edu.my",
    "student@sunway.edu",
    "student@sunway.com.my",
    "student@gmail.com",
    "student@imail.sunway.edu.my@evil.com",
    "student@@imail.sunway.edu.my",
    "@imail.sunway.edu.my",
    "student",
    "",
    "student@imail.sunway.edu.my evil.com",
    "student@imаil.sunway.edu.my", // Cyrillic "а"
  ])("rejects %s", (email) => {
    expect(isAllowedMemberEmail(email, domains)).toBe(false);
  });

  it("normalises before checking", () => {
    expect(normaliseEmail("  A@B.COM ")).toBe("a@b.com");
  });

  it("only ADMIN_EMAIL is admin, case-insensitively", () => {
    expect(isAdminEmail("MohammedAlqadhi745@Gmail.com ", admin)).toBe(true);
    expect(isAdminEmail("mohammedalqadhi745@gmail.com.evil.com", admin)).toBe(false);
    expect(isAdminEmail("xmohammedalqadhi745@gmail.com", admin)).toBe(false);
    expect(isAdminEmail("anyone@gmail.com", "")).toBe(false);
  });

  it("classifies emails", () => {
    const opts = { adminEmail: admin, allowedDomains: domains };
    expect(classifyEmail(admin, opts)).toBe("admin");
    expect(classifyEmail("a@imail.sunway.edu.my", opts)).toBe("member");
    expect(classifyEmail("someone@gmail.com", opts)).toBe("rejected");
  });
});
