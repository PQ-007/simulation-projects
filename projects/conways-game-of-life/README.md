# Conway's Game of Life

1970 онд John Conway зохиосон cellular automaton. Тоглогч байхгүй: эхний төлөвөө зураад, дараа нь энгийн дүрмүүд бүх зүйлийг шийднэ.

## Дүрэм

Grid-ийн нүд бүр **амьд** эсвэл **үхсэн** байна. Үе (generation) бүрт нүд бүр өөрийн 8 хөршийг (Moore neighborhood) тоолно. $N$ нь амьд хөршийн тоо бол:

1. **Survival:** амьд нүд $N \in \{2, 3\}$ үед амьд үлдэнэ.
2. **Birth:** үхсэн нүд яг $N = 3$ үед амилна.
3. Бусад бүх тохиолдолд нүд үхнэ эсвэл үхсэн хэвээр үлдэнэ.

Энэ дүрмийг товчоор **B3/S23** гэж бичдэг. Томьёогоор:

$$
s_{t+1}(x, y) =
\begin{cases}
1 & \text{хэрэв } N = 3 \\
s_t(x, y) & \text{хэрэв } N = 2 \\
0 & \text{бусад үед}
\end{cases}
\qquad
N = \sum_{\substack{dx, dy \in \{-1,0,1\} \\ (dx,dy) \neq (0,0)}} s_t(x + dx,\; y + dy)
$$

## Хэрхэн ашиглах

- **Зурах:** нүд дээр дарж, чирж зурна. Амьд нүднээс эхэлж чирвэл арилгана.
- **Step** нэг үе урагшилна, **Random** санамсаргүй дүүргэнэ, **Clear** цэвэрлэнэ.
- **Pattern** товчнууд алдартай хэлбэрүүдийг байрлуулна:
  - **Glider** — 4 үе тутамд нэг нүдээр диагоналиар хөдөлдөг.
  - **Gosper gun** — 30 үе тутамд шинэ glider "буудна". Хязгааргүй өсөлттэй анхны олдсон pattern.
  - **Pulsar** — 3 үеийн хугацаатай oscillator.
  - **R-pentomino** — ердөө 5 нүд боловч 1103 үеийн дараа л тогтворждог.

## Код

Grid нь `Uint8Array` (1 = амьд). Ирмэгүүд эсрэг талтайгаа холбогдсон (torus) тул grid-ийн гадна гарсан glider нөгөө талаас орж ирнэ:

```js
function step(cells, cols, rows) {
  const next = new Uint8Array(cells.length);
  for (let y = 0; y < rows; y++) {
    const up = ((y - 1 + rows) % rows) * cols, mid = y * cols, down = ((y + 1) % rows) * cols;
    for (let x = 0; x < cols; x++) {
      const l = (x - 1 + cols) % cols, r = (x + 1) % cols;
      const n = cells[up + l] + cells[up + x] + cells[up + r]
              + cells[mid + l] +                cells[mid + r]
              + cells[down + l] + cells[down + x] + cells[down + r];
      next[mid + x] = n === 3 || (n === 2 && cells[mid + x]) ? 1 : 0;
    }
  }
  return next;
}
```

Үе бүр $O(W \cdot H)$ хугацаа шаарддаг. Шинэ төлөвийг тусдаа массивт бичдэг нь чухал: эс тэгвээс аль хэдийн шинэчлэгдсэн хөршүүдийг тоолох алдаа гарна.

## Хэрэгжүүлэлт

- Энгийн JavaScript ба canvas, гадны library ашиглаагүй ([demo.js](demo.js)).
- Grid нь 96 × 64 хэмжээтэй, canvas-ийн хэмжээнд тааруулж томруулна.
