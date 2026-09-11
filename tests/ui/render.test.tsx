import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import { DataTable, type DataColumn } from "../../src/app/components/DataTable";
import { ErrorBoundary } from "../../src/app/components/ErrorBoundary";
import { createNekoTheme } from "../../src/app/theme";

interface Row {
  id: string;
  name: string;
  status: string;
}

const rows: Row[] = [
  { id: "1", name: "demo.is-cute.cat", status: "active" },
  { id: "2", name: "blog.is-cute.cat", status: "pending" },
];

const columns: DataColumn<Row>[] = [
  { key: "name", label: "域名", primary: true, render: (row) => row.name },
  { key: "status", label: "状态", render: (row) => row.status },
  { key: "actions", label: "操作", actions: true, render: (row) => <button>删除 {row.name}</button> },
];

/** jsdom has no layout engine, so useMediaQuery needs to be told what the viewport is. */
function mockViewport(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderWithTheme(ui: React.ReactNode, mode: "light" | "dark" = "light") {
  return render(<ThemeProvider theme={createNekoTheme(mode)}>{ui}</ThemeProvider>);
}

describe("theme", () => {
  it("builds both modes with a complete palette", () => {
    for (const mode of ["light", "dark"] as const) {
      const theme = createNekoTheme(mode);
      expect(theme.palette.mode).toBe(mode);
      // These are the custom MD3 tokens the components reference through sx.
      expect(theme.palette.surfaceContainer).toMatch(/^#/);
      expect(theme.palette.surfaceContainerHigh).toMatch(/^#/);
      expect(theme.palette.primaryContainer).toMatch(/^#/);
      expect(theme.palette.onPrimaryContainer).toMatch(/^#/);
      expect(theme.palette.background.default).toMatch(/^#/);
    }
  });

  it("gives light and dark genuinely different surfaces", () => {
    expect(createNekoTheme("light").palette.background.default).not.toBe(createNekoTheme("dark").palette.background.default);
  });
});

describe("DataTable", () => {
  it("renders every column as a table on wide screens", () => {
    mockViewport(false);
    renderWithTheme(<DataTable columns={columns} rows={rows} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("demo.is-cute.cat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /删除 blog/ })).toBeInTheDocument();
  });

  it("drops the table and keeps the actions reachable on narrow screens", () => {
    mockViewport(true);
    renderWithTheme(<DataTable columns={columns} rows={rows} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("demo.is-cute.cat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /删除 demo/ })).toBeInTheDocument();
  });

  it("shows the empty text only once loading has settled", () => {
    mockViewport(false);
    const { rerender } = renderWithTheme(<DataTable columns={columns} rows={[]} loading emptyText="空空如也" />);
    expect(screen.queryByText("空空如也")).not.toBeInTheDocument();

    rerender(
      <ThemeProvider theme={createNekoTheme("light")}>
        <DataTable columns={columns} rows={[]} loading={false} emptyText="空空如也" />
      </ThemeProvider>,
    );
    expect(screen.getByText("空空如也")).toBeInTheDocument();
  });

  it("only offers load-more when another page exists", () => {
    mockViewport(false);
    const { rerender } = renderWithTheme(<DataTable columns={columns} rows={rows} hasMore={false} />);
    expect(screen.queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument();

    rerender(
      <ThemeProvider theme={createNekoTheme("light")}>
        <DataTable columns={columns} rows={rows} hasMore onLoadMore={() => undefined} />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: "加载更多" })).toBeInTheDocument();
  });
});

describe("ErrorBoundary", () => {
  it("shows the failure instead of a blank page", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockViewport(false);

    function Boom(): React.ReactNode {
      throw new Error("渲染炸了");
    }

    renderWithTheme(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("页面出错了")).toBeInTheDocument();
    expect(screen.getByText("渲染炸了")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
