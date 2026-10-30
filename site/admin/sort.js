// Sortable tables on the admin page (AC8.7): a button in each column head sorts the rows by that
// column; again, the other way. A cell's `data-sort` is its value, else its text. No network.

/** Compare two cell values: numbers as numbers, else text in the reader's language. */
export function compare(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (a !== "" && b !== "" && Number.isFinite(x) && Number.isFinite(y)) return x - y;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** The rows' order by column `col`, `dir` 1 (up) or -1 (down); equal rows keep their order. */
export function order(rows, col, dir) {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((p, q) => dir * compare(p.row[col], q.row[col]) || p.i - q.i)
    .map((p) => p.row);
}

const value = (cell) => cell?.dataset.sort ?? cell?.textContent.trim() ?? "";

/** Make a table's column heads sort it. A head with `data-nosort` stays as it is. */
export function sortable(table) {
  const heads = [...table.tHead.rows[0].cells];
  const body = table.tBodies[0];
  heads.forEach((th, col) => {
    if ("nosort" in th.dataset) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sort";
    button.append(...th.childNodes);
    th.append(button);
    button.addEventListener("click", () => {
      const dir = th.getAttribute("aria-sort") === "ascending" ? -1 : 1;
      for (const h of heads) h.removeAttribute("aria-sort");
      th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
      const rows = [...body.rows].map((tr) => Object.assign([...tr.cells].map(value), { tr }));
      body.append(...order(rows, col, dir).map((r) => r.tr));
    });
  });
  return table;
}
