# Pathfinding

Grid дээрх **S** (start)-ээс **G** (goal) хүртэлх замыг олох таван algorithm. Хана зурж, шавар (жинтэй нүд) тавьж, S, G-г чирээд algorithm бүр хэрхэн тэлж байгааг хар.

## Grid бол graph

Нүд бүр нь **node**, хөрш нүднүүд нь **edge**. Edge-ийн жин нь орох нүдний зардал: энгийн нүд $1$, шавар $5$, диагональ алхам $\sqrt{2}$ дахин үнэтэй.

Бүх algorithm нэг загвартай: **frontier** (нээлттэй жагсаалт)-ээс нэг node авч **задлаад** (expand), хөршүүдийг нь frontier-д нэмнэ. Ялгаа нь зөвхөн frontier-ээс **аль node-ийг түрүүлж авах** вэ гэдэгт:

| Algorithm | Frontier-ээс авах дараалал | Хамгийн хямд зам? |
| --- | --- | --- |
| BFS | Эхэлж орсныг (queue) | Жингүй үед ✓ |
| DFS | Сүүлд орсныг (stack) | ✕ |
| Dijkstra | Хамгийн бага $g(n)$ | ✓ |
| A* | Хамгийн бага $f(n) = g(n) + h(n)$ | ✓ ($h$ admissible үед) |
| Greedy | Хамгийн бага $h(n)$ | ✕ |

- $g(n)$ — start-аас $n$ хүртэлх **бодит** зардал
- $h(n)$ — $n$-ээс goal хүртэлх **таамагласан** зардал (heuristic)

## Heuristic

4 чиглэлд хөдлөхөд **Manhattan** зай:

$$
h(n) = |x_n - x_G| + |y_n - y_G|
$$

Диагональ зөвшөөрвөл **octile** зай:

$$
h(n) = \Delta x + \Delta y + (\sqrt{2} - 2)\min(\Delta x, \Delta y)
$$

Хоёулаа **admissible** — бодит зардлаас хэзээ ч их гарахгүй — тул A* хамгийн хямд замыг олох баталгаатай. A* нь Dijkstra-тай ижил зам олох ч зорилго руу чиглэдэг учир хамаагүй цөөн node задална. Харин Greedy зөвхөн $h$-г хардаг тул ихэвчлэн хурдан ч хана тойрох үед урт зам сонгох нь бий.

## Хэрхэн ашиглах

- **Algorithm** сонгоод **▶ Visualize** — задалсан node-ууд дарааллаараа цэнхэрээс ягаан болж, frontier ногооноор, олдсон зам шараар зурагдана.
- Хоосон нүдэн дээр чирч **Хана** / **Шавар ×5** зурна, **Арилгах**-аар арилгана. **Maze** нь recursive backtracker-ээр лабиринт үүсгэнэ.
- **S**, **G**-г чирэхэд зам шууд дахин бодогдоно.
- **Бүх algorithm-ийг харьцуулах** хүснэгт нь одоогийн grid дээр algorithm бүрийн задалсан node, замын урт, зардлыг харуулна. Шавар тавиад BFS-ийн зам яагаад "хямд биш" болдгийг ажигла.

## Код

Таван algorithm нэг функц — зөвхөн priority өөр. Frontier нь binary heap:

```js
const priority = (n, g) => {
  counter++;
  switch (algo) {
    case 'bfs':      return { pr: counter };          // FIFO
    case 'dfs':      return { pr: -counter };         // LIFO
    case 'dijkstra': return { pr: g };
    case 'astar':    return { pr: g + h(n), tie: h(n) };
    case 'greedy':   return { pr: h(n) };
  }
};

open.push({ n: start, from: -1, g: 0, ...priority(start, 0) });
while (open.size) {
  const e = open.pop();
  if (closed[e.n]) continue;          // аль хэдийн илүү хямдаар задалсан
  closed[e.n] = 1; parent[e.n] = e.from;
  if (e.n === goal) break;
  for (const nb of neighbours(e.n)) {
    const g = e.g + cost(e.n, nb);
    if (g >= best[nb]) continue;      // Dijkstra / A*: илүү хямд зам олдсон үед л
    best[nb] = g;
    open.push({ n: nb, from: e.n, g, ...priority(nb, g) });
  }
}
```

Замыг goal-оос `parent`-аар буцаж мөшгөөд эргүүлнэ. Heap ашигласан тул Dijkstra, A* нь $O(E \log V)$ хугацаатай.

## Хэрэгжүүлэлт

- Энгийн JavaScript ба canvas ([demo.js](demo.js)), grid 45 × 25.
- Хайлтыг эхлээд бүтнээр нь бодож алхам бүрийг (задалсан node + нэмэгдсэн хөршүүд) хадгалаад, дараа нь frame бүрт хэдэн алхмаар тоглуулна.
- Диагональаар хоёр хананы завсраар "шургалахыг" хориглоно.
