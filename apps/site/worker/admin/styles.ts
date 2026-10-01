/** The admin workspace uses the public site's fonts and campaign palette. */
export const STYLES = `
@font-face{font-family:Atkinson;src:url('/fonts/atkinson-next-400-core.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:Atkinson;src:url('/fonts/atkinson-next-700-core.woff2') format('woff2');font-weight:700;font-display:swap}
@font-face{font-family:Fraunces;src:url('/fonts/fraunces-600-core.woff2') format('woff2');font-weight:600;font-display:swap}
:root{--surface:#f4ece7;--ink:#4b2130;--muted:#765360;--panel:#fffaf6;--soft:#eadbd3;--primary:#542432;--line:#d2bdb5;--error:#a12b23;--success:#276041;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--surface:#21181b;--ink:#f4ece7;--muted:#cfb8be;--panel:#302126;--soft:#442c34;--primary:#f4b6a1;--line:#795e67;--error:#ffb4ab;--success:#acd4b6;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--surface);color:var(--ink);font:1rem/1.55 Atkinson,system-ui,sans-serif}
a{color:inherit;text-decoration:none;overflow-wrap:anywhere}
a:hover{text-decoration:underline;text-underline-offset:.2em}
:focus-visible{outline:3px solid var(--primary);outline-offset:4px}
.skip-link{position:absolute;left:1rem;top:-10rem;background:var(--panel);padding:.75rem 1rem;border-radius:.75rem;z-index:2}
.skip-link:focus{top:1rem}
.site-header{background:#4b2130;color:#fff5ef}
.site-header :focus-visible{outline-color:#fff5ef}
.header-inner{max-width:80rem;margin:auto;padding:1.25rem 2rem;display:flex;justify-content:space-between;gap:1.5rem;align-items:center}
.brand{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:1.3rem;line-height:1.25}
.brand span{display:block;font-family:Atkinson,system-ui,sans-serif;font-size:.9rem;font-weight:400;margin-top:.25rem;color:#eadbd3}
.account{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:.75rem;font-size:.9rem;overflow-wrap:anywhere}
.account a{white-space:nowrap;flex-shrink:0;padding:.5rem .75rem;border:1px solid #a77b89;border-radius:.65rem;min-height:44px;display:inline-flex;align-items:center}
.workspace{max-width:80rem;margin:0 auto;display:grid;grid-template-columns:13rem minmax(0,1fr);gap:2.5rem;padding:2rem}
.admin-nav{align-self:start;display:grid;gap:.4rem}
.admin-nav a{display:flex;align-items:center;min-height:48px;padding:.7rem 1rem;border-radius:.75rem;font-weight:700;line-height:1.3}
.admin-nav a:hover{background:var(--soft);text-decoration:none}
.admin-nav a[aria-current]{background:var(--ink);color:var(--surface)}
.admin-nav .public-link{font-weight:400;margin-top:1rem}
main{min-width:0}
.message{max-width:42rem;margin:4rem auto;padding:1.5rem}.message p{margin-top:1rem}
main>section{scroll-margin-top:1.5rem}
h1,h2,h3,p{margin:0}
h1{font:600 clamp(1.9rem,3vw,2.5rem)/1.15 Fraunces,Georgia,serif;margin-bottom:.75rem;text-wrap:balance}
h2{font-size:1.3rem;line-height:1.3;margin-bottom:.5rem}
h3{font-size:1.1rem;line-height:1.35}
p+p{margin-top:.75rem}
.intro{color:var(--muted);max-width:44rem;margin-bottom:1.75rem}
.muted{color:var(--muted)}
.panel,.entry,.empty-state{background:var(--panel);border:1px solid var(--line);border-radius:1rem;padding:1.5rem}
.panel+.panel,.entry+.entry{margin-top:1rem}
.empty-state{padding:2.5rem 1.5rem;margin-top:1rem}
.empty-state h2{margin-bottom:.5rem}
.empty-state p{color:var(--muted);max-width:40rem}
.notice{padding:1rem 1.25rem;border-radius:.75rem;background:var(--soft);border-left:5px solid var(--success);margin-bottom:1.5rem;overflow-wrap:anywhere}
.notice.problem{border-left-color:var(--error)}
.filters{display:grid;gap:1rem;margin-bottom:1.5rem}
.tabs{display:flex;flex-wrap:wrap;gap:.5rem}
.tabs a,.button-link,summary{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:.55rem 1rem;border-radius:.7rem;font-weight:700;line-height:1.3}
.tabs a{background:var(--panel);border:1px solid var(--line)}
.tabs a:hover{background:var(--soft);text-decoration:none}
.tabs a[aria-current]{background:var(--ink);color:var(--surface);border-color:var(--ink)}
.day-filter{display:flex;gap:.75rem;align-items:end;flex-wrap:wrap}
.day-filter label{flex:1;max-width:16rem}
.entry{overflow-wrap:anywhere}
.entry-header{display:flex;gap:1rem;justify-content:space-between;align-items:start;margin-bottom:1rem}
.entry-header h2{margin-bottom:.25rem}
.badge{display:inline-flex;padding:.3rem .65rem;border-radius:.5rem;background:var(--soft);font-size:.9rem;font-weight:700;white-space:nowrap}
.badge.approved{color:var(--success)}
.badge.removed{color:var(--error)}
.entry-details{display:flex;flex-wrap:wrap;gap:.6rem 1.5rem;margin:0 0 1rem}
.entry-details div{min-width:0}
dt{color:var(--muted);font-size:.9rem}dd{margin:0}
.trip-description{font-size:1.1rem;white-space:pre-wrap}
.entry-note{margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line)}
.entry-note strong{display:block;margin-bottom:.3rem}
.entry-status{font-size:.9rem;color:var(--muted);margin-top:1rem}
.entry img{display:block;max-width:100%;height:auto;max-height:24rem;object-fit:contain;margin-top:1rem;border-radius:.75rem}
.actions{display:flex;flex-wrap:wrap;gap:.75rem;align-items:end;margin-top:1rem}
button,.button-link{background:var(--ink);color:var(--surface);border:1px solid transparent;border-radius:.7rem;min-height:44px;padding:.6rem 1.1rem;font:700 1rem/1.3 Atkinson,system-ui,sans-serif;cursor:pointer;touch-action:manipulation}
button:hover,.button-link:hover{background:var(--primary);color:var(--surface);text-decoration:none}
button.quiet,.button-link.quiet{background:var(--panel);color:var(--ink);border-color:var(--line)}
button.quiet:hover,.button-link.quiet:hover{background:var(--soft)}
.remove{margin-top:1rem}
summary{cursor:pointer;border:1px solid var(--line);justify-content:flex-start;list-style:revert;display:list-item;width:fit-content}
summary:hover{background:var(--soft)}
.remove[open]{padding:1rem;background:var(--surface);border-radius:.75rem}
.remove[open] summary{margin-bottom:1rem}
.remove p{color:var(--muted)}
form.stack{display:grid;gap:1.25rem;max-width:38rem}
label{display:block;font-weight:700}
input,select,textarea{font:inherit;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:.65rem;padding:.65rem .75rem;min-height:44px;max-width:100%}
label>input:not([type=checkbox]),label>select,label>textarea{display:block;width:100%;margin-top:.4rem}
input[type=checkbox]{width:1.25rem;height:1.25rem;min-height:0;flex-shrink:0;accent-color:var(--ink);margin:.2rem 0 0}
.check{display:flex;gap:.75rem;align-items:start;font-weight:400;padding:.75rem 0;min-height:44px}
.requirements{margin:0 0 1.5rem;padding-left:1.25rem;color:var(--muted)}
.requirements li+li{margin-top:.35rem}
.stack button{justify-self:start}
.table-scroll{overflow-x:auto;max-width:100%;margin-top:1rem;border-radius:.75rem;border:1px solid var(--line)}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
caption{text-align:left;padding:.75rem 1rem;color:var(--muted)}
th,td{text-align:right;padding:.8rem 1rem;border-bottom:1px solid var(--line)}
th:first-child,td:first-child{text-align:left}
thead,tfoot{background:var(--soft)}
tbody tr:last-child th,tbody tr:last-child td,tfoot th{border-bottom:0}
.summary-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:1.5rem 0}
.summary-list div{padding:1rem;background:var(--soft);border-radius:.75rem}
.summary-list dd{font-size:1.8rem;font-weight:700;font-variant-numeric:tabular-nums}
ul.plain{list-style:none;padding:0;margin:0}
.volunteer-list li{padding:.75rem 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
.volunteer-list li:last-child{border:0}
.pager{display:flex;justify-content:space-between;gap:1rem;margin-top:1.5rem}
.section-actions{margin-top:1.5rem}
.winner{font-size:1.1rem;margin:1rem 0}
@media(max-width:800px){.header-inner{padding:1rem 1.25rem;align-items:start}.account{max-width:50%}.account span{display:none}.workspace{grid-template-columns:minmax(0,1fr);gap:1.5rem;padding:1.25rem}.admin-nav{grid-template-columns:repeat(3,minmax(0,1fr));gap:.4rem}.admin-nav a{justify-content:center;text-align:center;padding:.65rem .35rem;font-size:.9rem}.admin-nav .public-link{display:none}.panel,.entry{padding:1.25rem}.summary-list{gap:.5rem}.summary-list div{padding:.75rem}.summary-list dt{font-size:.85rem}.entry-header{flex-direction:column;gap:.65rem}.table-scroll th,.table-scroll td{padding:.7rem .75rem}}
@media(forced-colors:active){.tabs a[aria-current],.admin-nav a[aria-current]{outline:2px solid Highlight}button,.badge{border:1px solid ButtonText}}
`;
