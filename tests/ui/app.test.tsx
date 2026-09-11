import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/app/App";
import { ThemeRoot } from "../../src/app/components/ThemeRoot";

/** Minimal API stub: config succeeds, everything else answers "not signed in". */
function stubApi(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const match = Object.keys(overrides).find((key) => url.includes(key));
      if (match) {
        return new Response(JSON.stringify(overrides[match]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/api/public/config")) {
        return new Response(JSON.stringify({ parentDomain: "is-cute.cat", turnstileSiteKey: "1x00000000000000000000AA" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ message: "请先登录。" }), { status: 401, headers: { "content-type": "application/json" } });
    }),
  );
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  window.history.replaceState({}, "", "/");
});

describe("App", () => {
  it("lands on the sign-in screen when there is no session", async () => {
    stubApi();
    render(
      <ThemeRoot>
        <App />
      </ThemeRoot>,
    );

    expect(await screen.findByRole("tab", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "注册" })).toBeInTheDocument();
  });

  it("swaps the tabs for a dedicated reset form instead of showing both at once", async () => {
    stubApi();
    const user = userEvent.setup();
    render(
      <ThemeRoot>
        <App />
      </ThemeRoot>,
    );

    await screen.findByRole("tab", { name: "登录" });
    await user.click(screen.getByRole("button", { name: "忘记密码？" }));

    expect(screen.queryByRole("tab", { name: "登录" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("注册邮箱")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送重置指令" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回登录" }));
    expect(screen.getByRole("tab", { name: "登录" })).toBeInTheDocument();
  });

  it("renders the signed-in shell and lets the colour mode be switched", async () => {
    stubApi({
      "/api/me": { id: "usr_1", username: "vahiru", email: "a@b.c", role: "user", telegramUserId: null, emailVerifiedAt: "2026-01-01 00:00:00" },
      "/api/dns/records": [],
    });
    const user = userEvent.setup();
    render(
      <ThemeRoot>
        <App />
      </ThemeRoot>,
    );

    expect(await screen.findByText("我的 DNS 记录")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /外观：跟随系统/ });
    await user.click(toggle);
    await waitFor(() => expect(screen.getByRole("button", { name: /外观：浅色/ })).toBeInTheDocument());
  });

  it("flags a reserved host name before anything is submitted", async () => {
    stubApi({
      "/api/me": { id: "usr_1", username: "vahiru", email: "a@b.c", role: "user", telegramUserId: null, emailVerifiedAt: "2026-01-01 00:00:00" },
      "/api/dns/records": [],
    });
    const user = userEvent.setup();
    render(
      <ThemeRoot>
        <App />
      </ThemeRoot>,
    );

    await screen.findByText("我的 DNS 记录");
    await user.type(screen.getByLabelText("主机记录"), "admin");
    // The parent domain now lives in the field's suffix rather than its label.
    expect(screen.getByText(".is-cute.cat")).toBeInTheDocument();

    expect(await screen.findByText(/保留名称不可申请/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交申请" })).toBeDisabled();
  });
});
