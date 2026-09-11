import {
  Box,
  Button,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { ReactNode } from "react";

export interface DataColumn<Row> {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  /** Used as the card heading on narrow screens instead of a label/value pair. */
  primary?: boolean;
  /** Pinned to the bottom of the card on narrow screens. */
  actions?: boolean;
  /** Dropped from the card layout entirely (for columns that only add noise on a phone). */
  hideOnMobile?: boolean;
}

interface DataTableProps<Row> {
  columns: DataColumn<Row>[];
  rows: Row[];
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  emptyText?: string;
}

const SKELETON_ROWS = 4;

function LoadMore({ loading, hasMore, onLoadMore }: { loading: boolean; hasMore: boolean; onLoadMore?: () => void }) {
  if (!hasMore) return null;
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
      <Button variant="text" disabled={loading} onClick={onLoadMore}>
        {loading ? "加载中…" : "加载更多"}
      </Button>
    </Box>
  );
}

/**
 * Renders as a table on md and up, and as a stack of cards below that: eight columns on a
 * phone forced a horizontal scroll that hid the action buttons off-screen.
 */
export function DataTable<Row extends { id: string }>({
  columns,
  rows,
  loading = false,
  hasMore = false,
  onLoadMore,
  emptyText = "暂无数据记录",
}: DataTableProps<Row>) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("md"));
  const showSkeleton = loading && rows.length === 0;

  if (compact) {
    const primary = columns.find((column) => column.primary);
    const actions = columns.find((column) => column.actions);
    const details = columns.filter((column) => !column.primary && !column.actions && !column.hideOnMobile);

    return (
      <Stack spacing={2}>
        {showSkeleton &&
          Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Paper key={index} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
              <Skeleton width="55%" height={26} />
              <Skeleton width="85%" />
              <Skeleton width="70%" />
            </Paper>
          ))}

        {!showSkeleton && rows.length === 0 && (
          <Paper sx={{ p: 6, textAlign: "center", border: "1px solid", borderColor: "divider" }}>
            <Typography color="text.secondary">{emptyText}</Typography>
          </Paper>
        )}

        {rows.map((row) => (
          <Paper key={row.id} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}>
            <Stack spacing={1.5}>
              {primary && (
                <Typography sx={{ fontWeight: 700, wordBreak: "break-all" }} component="div">
                  {primary.render(row)}
                </Typography>
              )}
              <Box sx={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 1, alignItems: "baseline" }}>
                {details.map((column) => (
                  <Box key={column.key} sx={{ display: "contents" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                      {column.label}
                    </Typography>
                    <Box sx={{ minWidth: 0, wordBreak: "break-all", fontSize: "0.9375rem" }}>{column.render(row)}</Box>
                  </Box>
                ))}
              </Box>
              {actions && <Box sx={{ pt: 0.5 }}>{actions.render(row)}</Box>}
            </Stack>
          </Paper>
        ))}

        <LoadMore loading={loading} hasMore={hasMore} onLoadMore={onLoadMore} />
      </Stack>
    );
  }

  return (
    <TableContainer component={Paper} sx={{ borderRadius: "16px", border: "1px solid", borderColor: "divider", overflow: "hidden", width: "100%" }}>
      <Box sx={{ overflowX: "auto" }}>
        <Table>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.key} sx={{ whiteSpace: "nowrap" }}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {showSkeleton &&
              Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <TableRow key={index}>
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      <Skeleton />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!showSkeleton && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 10 }}>
                  <Typography color="text.secondary">{emptyText}</Typography>
                </TableCell>
              </TableRow>
            )}

            {rows.map((row) => (
              <TableRow key={row.id} hover>
                {columns.map((column) => (
                  <TableCell key={column.key}>{column.render(row)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <Box sx={{ borderTop: hasMore ? "1px solid" : "none", borderColor: "divider" }}>
        <LoadMore loading={loading} hasMore={hasMore} onLoadMore={onLoadMore} />
      </Box>
    </TableContainer>
  );
}
