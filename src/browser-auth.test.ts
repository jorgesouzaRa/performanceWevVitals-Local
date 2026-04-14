import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCookieHeaderForUrl } from "./browser-auth.js";

describe("buildCookieHeaderForUrl", () => {
  it("inclui cookies do domínio e path", () => {
    const header = buildCookieHeaderForUrl(
      {
        cookies: [
          {
            name: "sid",
            value: "abc",
            domain: ".example.com",
            path: "/",
          },
          {
            name: "other",
            value: "x",
            domain: "other.net",
            path: "/",
          },
        ],
      },
      "https://www.example.com/app"
    );
    assert.ok(header?.includes("sid=abc"));
    assert.ok(!header?.includes("other="));
  });
});
