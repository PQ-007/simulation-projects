# Finite State Machine

Finite state machine (FSM) нь төгсгөлөг тооны **төлөв**-тэй, ирсэн **event** бүрээр нэг төлвөөс нөгөөд шилждэг загвар. Тоглоомын AI, эргэдэг хаалга, гэрлэн дохио, network protocol, UI — бүгд state machine.

## Тодорхойлолт

State machine-ийг дараах зүйлсээр тодорхойлно:

$$
M = (Q,\ \Sigma,\ \delta,\ q_0)
$$

- $Q$ — төлвүүдийн олонлог, $\Sigma$ — event-үүдийн олонлог (alphabet)
- $\delta : Q \times \Sigma \to Q$ — шилжилтийн функц: "энэ төлөвт энэ event ирвэл аль төлөв рүү шилжих вэ"
- $q_0 \in Q$ — эхлэх төлөв

Event-үүд $e_1 e_2 \dots e_n$ дараалан ирэхэд machine $q_i = \delta(q_{i-1}, e_i)$ гэж алхана. Нэг агшинд machine яг **нэг** төлөвт байх тул түүний үйлдэл ч тодорхой байна.

## Game bot (AI)

Тоглоомын AI-д state machine хамгийн өргөн хэрэглэгддэг. **Game bot (AI)** жишээнд bot-ийн "тархи" нь яг энэ machine:

| Төлөв | Bot юу хийх вэ |
| --- | --- |
| `Patrol` | 4 цэгийн хооронд эргүүл хийнэ |
| `Chase` | Player рүү гүйнэ |
| `Attack` | Зогсоод player рүү буудна |
| `Flee` | Player-ээс зугтаж, эдгэрнэ |
| `Dead` | Хөдөлгөөнгүй, 3 секундын дараа дахин төрнө |

Оролт нь мөр биш — **ертөнцийн нөхцөл** frame бүрт event болж machine руу орно:

| Event | Нөхцөл |
| --- | --- |
| `s` / `l` | Player харах зайд орсон / гарсан |
| `r` / `o` | Player буудах зайд орсон / гарсан |
| `h` / `f` | Health 30-аас бага / 95-аас дээш |
| `d` | Health 0 — bot үхсэн |
| `n` | Үхсэнээс хойш 3 секунд өнгөрсөн (respawn) |

Одоогийн төлөвт тухайн event-ийн шилжилт байхгүй бол event-ийг үл тоомсорлож, төлөв хэвээр үлдэнэ. Player-г arena дээр чирж bot-ийг ойртуулж, холдуулж үз. Player ойр ирвэл буцааж буудах тул bot-ийн health буурч, `Flee` руу шилжинэ — амжихгүй бол `Dead`.

### Any state

Bot аль ч төлөвтөө үхэж болно. Төлөв бүрээс `Dead` руу тусдаа шилжилт бичихийн оронд **any state** (`*`) ашиглана — Unity-ийн Animator-тай ижил санаа:

```text
* -> Dead : d       # Patrol, Chase, Attack, Flee — алинаас нь ч
Dead -> Patrol : n
```

`*` шилжилт нь өөрийн очих төлвөөс (энд `Dead`) бусад бүх төлөвт хүчинтэй.

### Тархийг өөрчлөх

**Definition засах** хэсэгт bot-ийн тархийг өөрчилж болно:

- `Flee`-тэй мөрүүдийг устгавал bot хэзээ ч зугтахгүй, үхтэлээ тулалдана.
- `Dead -> Patrol : n`-г устгавал bot дахин төрөхгүй.
- `Patrol -> Attack : r` нэмбэл хөөхгүйгээр шууд буудна.

## Turnstile ба Traffic light

Эдгээр жишээнд event-үүдийг **оролтын мөр** болгон бичээд **Step ▶**-ээр нэг нэгээр, **▶ Run**-аар автоматаар ажиллуулна. Graph-ийн хажууд бодит дүрслэл хөдөлнө:

- **Turnstile** — `c` = зоос хийх, `p` = түлхэх. Зоос хийвэл түгжээ тайлагдаж, түлхэхэд хүн нэвтэрч дахин түгжигдэнэ. Түгжээтэй үед түлхвэл нэвтэрч чадахгүй.
- **Traffic light** — `t` = timer, `e` = emergency. Red → Green → Yellow → Red гэж эргэлдэнэ, emergency ирвэл шууд Red.

Доор нь **Trace** мөр өнгөрсөн төлвүүдийг дарааллаар нь харуулна.

## Definition-ий бичиглэл

```text
start: Locked
Locked -> Unlocked : c
Locked -> Locked : p      # # -ээс хойш тайлбар
* -> Broken : x           # * = бүх төлвөөс
```

Event бүр нэг тэмдэгт. Хэд хэдэн event-ийг таслалаар бичнэ: `q0 -> q1 : a, b`. Engine нь мөн `accept:` төлөв болон `ε` шилжилтийг (NFA) дэмждэг.

## Код

Нэг алхам: идэвхтэй төлвөөс тухайн event-ийн шилжилтийг хайна. `*` шилжилт бүх төлвөөс хүчинтэй:

```js
function step(m, states, c) {
  const next = new Set(), used = [];
  for (const e of m.edges) {
    if (e.sym !== c) continue;
    if (states.has(e.from) || (e.from === '*' && [...states].some(s => s !== e.to))) {
      next.add(e.to);
      used.push(e);
    }
  }
  return { states: closure(m, next), used };
}
```

Bot frame бүрт нөхцлүүдийг тогтсон дарааллаар шалгаж, одоогийн төлөвт шилжилттэй анхны event-ийг илгээнэ:

```js
const cond = { d: bot.hp <= 0, n: respawnReady, h: bot.hp < 30, f: bot.hp >= 95,
               r: dist < RANGE, o: dist >= RANGE, s: dist < SIGHT, l: dist >= SIGHT };
for (const k of ['d', 'n', 'h', 'f', 'r', 'o', 's', 'l']) if (cond[k] && fire(k)) break;

switch (state()) {               // төлөв нь үйлдлийг шийднэ
  case 'patrol': /* waypoint руу явна */ break;
  case 'chase':  /* player руу гүйнэ */ break;
  case 'attack': /* буудна */ break;
  case 'flee':   /* зугтана */ break;
}
```

## Хэрэгжүүлэлт

- Энгийн JavaScript: graph нь SVG ([demo.js](demo.js)), Turnstile/Traffic light-ийн зураг [scenes.js](scenes.js), bot-ийн arena canvas дээр [bot.js](bot.js).
- Хоёр төлвийн хооронд хоёр чиглэлд шилжилт байвал, эсвэл шулуун шугам өөр төлөв дундуур гарах бол ирмэгийг муруй болгоно. Төлвүүдийг чирж байрлуулж болно.
- Definition-ийг бичих зуур дахин parse хийнэ; bot шинэ тархиараа шууд үргэлжлүүлнэ.
