# Wisp Run

A neon arcade survival game. Steer a glowing wisp through dark space, gather drifting motes of light, and dodge the shadow shards that hunt you. The longer you last, the denser and faster the field becomes.

**Play live:** [https://xiuN1ng.github.io/wisp-run/](https://xiuN1ng.github.io/wisp-run/)

## Controls

| Input | Action |
| --- | --- |
| WASD or arrow keys | Move |
| Mouse / finger | Hold or drag to steer toward the pointer |
| M or mute button | Toggle sound |
| Enter / Space | Start or restart |

## How to run locally

Open `index.html` in a browser, or from the repo root:

```bash
python3 -m http.server
```

Then visit [http://localhost:8000](http://localhost:8000).

No build step. Vanilla HTML, CSS, and JavaScript at the repository root — GitHub Pages can serve the game from `main`.

## Gameplay

- Collect motes to score. Rare magenta motes are worth more.
- Combos multiply points as long as you stay alive.
- Touching a shadow shard ends the run. Difficulty ramps over time.
- Best score is saved in your browser (`localStorage`).

## License

MIT © 2026 Xiuning Kou

---

## 中文

**Wisp Run** 是一款霓虹街机小游戏：操控发光的「灵火」收集光点、躲避暗影碎片。难度会随时间上升，连击可提高分数。

- **操作：** WASD / 方向键移动，按住或拖动指针朝向目标。`M` 或右上角按钮开关声音。
- **本地运行：** 直接打开 `index.html`，或执行 `python3 -m http.server`。
- **在线游玩：** https://xiuN1ng.github.io/wisp-run/
