'use strict';

// CSS extrait du pattern des specs existants (launcher.html), inchange.
// Garde la palette dark + violet/cyan : c'est la DA des specs generes (pas de l'app Erisclave).
module.exports = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0A0A0F; --violet: #6B2FA0; --violet-l: #9B4FCF; --cyan: #00E5FF;
  --green: #2ECC71; --red: #E74C3C; --gold: #F1C40F; --orange: #E67E22;
  --text: #F0F2FF; --slate: #8892A4;
  --card-bg: rgba(14,14,22,0.55); --card-bdr: rgba(255,255,255,0.06);
  --radius: 18px; --radius-sm: 10px; --font: 'Inter', sans-serif;
}
html { scroll-behavior: smooth; }
body { font-family: var(--font); background-color: var(--bg); color: var(--text); line-height: 1.7; min-height: 100vh; overflow-x: hidden; }
body::before {
  content: ''; position: fixed; inset: 0;
  background: radial-gradient(ellipse 900px 600px at 10% 20%, rgba(107,47,160,0.18) 0%, transparent 70%),
              radial-gradient(ellipse 700px 500px at 85% 75%, rgba(0,229,255,0.09) 0%, transparent 70%),
              radial-gradient(ellipse 500px 400px at 50% 90%, rgba(241,196,15,0.05) 0%, transparent 60%);
  pointer-events: none; z-index: 0;
}
body::after {
  content: ''; position: fixed; inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
  pointer-events: none; z-index: 0; opacity: 0.6;
}
.layout { display: flex; min-height: 100vh; position: relative; z-index: 1; }
.sidebar {
  width: 280px; flex-shrink: 0; position: sticky; top: 0; height: 100vh;
  overflow-y: auto; padding: 32px 20px;
  background: rgba(10,10,15,0.70); backdrop-filter: blur(24px);
  border-right: 1px solid var(--card-bdr);
  display: flex; flex-direction: column; gap: 6px;
  scrollbar-width: thin; scrollbar-color: var(--violet) transparent;
}
.sidebar::-webkit-scrollbar { width: 4px; }
.sidebar::-webkit-scrollbar-track { background: transparent; }
.sidebar::-webkit-scrollbar-thumb { background: var(--violet); border-radius: 4px; }
.sidebar-logo { font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--violet-l); margin-bottom: 4px; padding-bottom: 16px; border-bottom: 1px solid var(--card-bdr); }
.sidebar-logo span { color: var(--cyan); }
.sidebar-back { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--slate); text-decoration: none; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--card-bdr); margin-bottom: 12px; transition: color .2s, border-color .2s, background .2s; }
.sidebar-back:hover { color: var(--cyan); border-color: rgba(0,229,255,0.25); background: rgba(0,229,255,0.04); }
.sidebar-title { font-size: 10px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: var(--slate); margin: 16px 0 6px 8px; }
.nav-link { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--radius-sm); font-size: 13px; color: var(--slate); text-decoration: none; transition: all .2s; border: 1px solid transparent; }
.nav-link .num { font-size: 10px; font-weight: 700; color: var(--violet-l); background: rgba(107,47,160,0.15); border-radius: 4px; padding: 1px 5px; min-width: 22px; text-align: center; }
.nav-link:hover { color: var(--text); background: rgba(107,47,160,0.12); border-color: rgba(107,47,160,0.25); }
.nav-link.active { color: var(--cyan); background: rgba(0,229,255,0.06); border-color: rgba(0,229,255,0.18); }
.main { flex: 1; padding: 48px 56px 80px 56px; max-width: 1100px; }
.page-header { margin-bottom: 56px; animation: fadeUp .6s ease both; }
.page-header .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--violet-l); margin-bottom: 12px; }
.page-header h1 { font-size: clamp(28px, 4vw, 44px); font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; background: linear-gradient(135deg, var(--text) 0%, var(--cyan) 40%, var(--violet-l) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 16px; }
.page-header p { color: var(--slate); font-size: 15px; max-width: 640px; }
.header-badges { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
.badge { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; padding: 4px 12px; border-radius: 999px; border: 1px solid; }
.badge-violet   { color: var(--violet-l); border-color: rgba(107,47,160,0.4); background: rgba(107,47,160,0.1); }
.badge-cyan     { color: var(--cyan);     border-color: rgba(0,229,255,0.3);   background: rgba(0,229,255,0.07); }
.badge-green    { color: var(--green);    border-color: rgba(46,204,113,0.3);  background: rgba(46,204,113,0.07); }
.badge-gold     { color: var(--gold);     border-color: rgba(241,196,15,0.3);  background: rgba(241,196,15,0.07); }
.badge-slate    { color: var(--slate);    border-color: rgba(136,146,164,0.3); background: rgba(136,146,164,0.07); }
.badge-red      { color: var(--red);      border-color: rgba(231,76,60,0.3);   background: rgba(231,76,60,0.07); }
.badge-orange   { color: var(--orange);   border-color: rgba(230,126,34,0.3);  background: rgba(230,126,34,0.07); }
.section-card { background: var(--card-bg); backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px); border: 1px solid var(--card-bdr); border-radius: var(--radius); padding: 40px; margin-bottom: 32px; animation: fadeUp .5s ease both; }
.section-card:nth-child(1)  { animation-delay: .05s; }
.section-card:nth-child(2)  { animation-delay: .10s; }
.section-card:nth-child(3)  { animation-delay: .15s; }
.section-card:nth-child(4)  { animation-delay: .20s; }
.section-card:nth-child(5)  { animation-delay: .25s; }
.section-card:nth-child(6)  { animation-delay: .30s; }
.section-card:nth-child(7)  { animation-delay: .35s; }
.section-card:nth-child(8)  { animation-delay: .40s; }
.section-card:nth-child(9)  { animation-delay: .45s; }
.section-card:nth-child(10) { animation-delay: .50s; }
.section-card:nth-child(11) { animation-delay: .55s; }
.section-card:nth-child(12) { animation-delay: .60s; }
.section-card:nth-child(13) { animation-delay: .65s; }
.section-card:nth-child(14) { animation-delay: .70s; }
.section-card h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
.section-card h2 .s-num { font-size: 11px; font-weight: 700; color: var(--bg); background: linear-gradient(135deg, var(--violet) 0%, var(--violet-l) 100%); border-radius: 6px; padding: 3px 9px; letter-spacing: 0.06em; }
.section-card h2 .s-num.cyan-num   { background: linear-gradient(135deg, #0097a7 0%, var(--cyan) 100%); }
.section-card h2 .s-num.green-num  { background: linear-gradient(135deg, #1a8a48 0%, var(--green) 100%); }
.section-card h2 .s-num.gold-num   { background: linear-gradient(135deg, #b8860b 0%, var(--gold) 100%); }
.section-card h2 .s-num.orange-num { background: linear-gradient(135deg, #a0531a 0%, var(--orange) 100%); }
.section-card h2 .s-num.red-num    { background: linear-gradient(135deg, #8b1a1a 0%, var(--red) 100%); }
.section-card h3 { font-size: 15px; font-weight: 600; color: var(--text); margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--card-bdr); }
.section-card h3:first-child { margin-top: 0; }
.section-card p { color: var(--slate); font-size: 14px; margin-bottom: 12px; }
.section-card p:last-child { margin-bottom: 0; }
.section-card code { background: rgba(0,229,255,0.08); color: var(--cyan); padding: 1px 6px; border-radius: 4px; font-size: 12.5px; font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace; }
.section-card ul { list-style: none; display: flex; flex-direction: column; gap: 6px; }
.section-card ul li { font-size: 14px; color: var(--slate); padding-left: 16px; position: relative; line-height: 1.6; }
.section-card ul li::before { content: '>'; position: absolute; left: 0; color: var(--violet-l); font-weight: 700; }
.section-card ul li strong { color: var(--text); }
.section-card ul.checklist { list-style: none; display: flex; flex-direction: column; gap: 7px; margin: 8px 0; }
.section-card ul.checklist li { font-size: 13.5px; color: var(--slate); padding-left: 26px; position: relative; }
.section-card ul.checklist li::before { content: ''; position: absolute; left: 0; top: 5px; width: 14px; height: 14px; border-radius: 4px; border: 1.5px solid rgba(0,229,255,0.4); background: rgba(0,229,255,0.08); }
.section-card a { color: var(--cyan); text-decoration: none; border-bottom: 1px dotted rgba(0,229,255,0.4); }
.section-card a:hover { border-bottom-style: solid; }
.section-card .hint { font-size: 13px; color: var(--slate); font-style: italic; margin-bottom: 18px; padding: 10px 14px; background: rgba(0,229,255,0.04); border-left: 2px solid rgba(0,229,255,0.3); border-radius: 4px; }
.table-wrap { overflow-x: auto; margin: 16px 0; border-radius: var(--radius-sm); border: 1px solid var(--card-bdr); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead tr { background: rgba(107,47,160,0.18); }
thead th { padding: 10px 16px; text-align: left; font-weight: 600; color: var(--text); font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; border-bottom: 1px solid rgba(107,47,160,0.3); }
tbody tr { border-bottom: 1px solid var(--card-bdr); transition: background .15s; }
tbody tr:last-child { border-bottom: none; }
tbody tr:nth-child(even) { background: rgba(255,255,255,0.016); }
tbody tr:hover { background: rgba(107,47,160,0.08); }
tbody td { padding: 9px 16px; color: var(--slate); vertical-align: top; line-height: 1.5; }
tbody td:first-child { color: var(--text); font-weight: 500; }
.ref-images { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin: 16px 0; }
.ref-images figure { border: 1px solid var(--card-bdr); border-radius: var(--radius-sm); overflow: hidden; background: rgba(0,0,0,0.3); }
.ref-images img { display: block; width: 100%; height: auto; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
.divider { height: 1px; background: linear-gradient(90deg, transparent, var(--card-bdr), transparent); margin: 24px 0; }
.mobile-nav-toggle { display: none; position: fixed; bottom: 24px; right: 24px; z-index: 100; background: var(--violet); color: #fff; border: none; border-radius: 50%; width: 48px; height: 48px; font-size: 20px; cursor: pointer; box-shadow: 0 4px 20px rgba(107,47,160,0.4); transition: transform .2s; }
.mobile-nav-toggle:hover { transform: scale(1.08); }
@media (max-width: 900px) {
  .layout { flex-direction: column; }
  .sidebar { position: fixed; top: 0; left: 0; bottom: 0; transform: translateX(-100%); transition: transform .3s ease; z-index: 50; width: 260px; }
  .sidebar.open { transform: translateX(0); }
  .main { padding: 32px 20px 60px; }
  .mobile-nav-toggle { display: flex; align-items: center; justify-content: center; }
}
@media (max-width: 600px) { .section-card { padding: 24px 18px; } .page-header h1 { font-size: 26px; } }`;
