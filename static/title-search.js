// Title search: fetches static/titles.json once and matches page titles in
// memory. Loaded by TitleSearch.tsx on every page; edit here rather than in
// the component to avoid a full site re-emit.
(() => {
  const base = document.currentScript.dataset.base
  const mount = document.getElementById("title-search") || document.getElementById("pagefind-search")
  if (!mount) return

  const MAX_RESULTS = 25
  const fold = (s) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()

  let entries = null // [{ slug, title, folded, words, stub }]
  let loading = null
  function load() {
    if (!loading) {
      loading = fetch(`${base}/static/titles.json`)
        .then((r) => r.json())
        .then((rows) => {
          entries = rows.map(([slug, title, stub]) => {
            const folded = fold(title)
            return { slug, title, folded, words: folded.split(/[^a-z0-9]+/).filter(Boolean), stub: !!stub }
          })
        })
    }
    return loading
  }

  // Lower is better: exact title, then every query word a whole word ("fall"
  // → The Fall before Fallover 24), then title prefix, then every query word
  // a word prefix, then plain substring. Stubs sort after finished pages.
  function score(e, q, qwords) {
    let s
    if (e.folded === q) s = 0
    else if (qwords.every((w) => e.words.includes(w))) s = 1
    else if (e.folded.startsWith(q)) s = 2
    else if (qwords.every((w) => e.words.some((t) => t.startsWith(w)))) s = 3
    else if (e.folded.includes(q)) s = 4
    else return null
    return s + (e.stub ? 0.5 : 0)
  }

  function search(query) {
    const q = fold(query.trim())
    if (q.length < 2) return []
    const qwords = q.split(/[^a-z0-9]+/).filter(Boolean)
    const hits = []
    for (const e of entries) {
      const s = score(e, q, qwords)
      if (s !== null) hits.push([s, e])
    }
    hits.sort((a, b) => a[0] - b[0] || a[1].title.length - b[1].title.length || a[1].title.localeCompare(b[1].title))
    return hits.slice(0, MAX_RESULTS).map((h) => h[1])
  }

  const folderOf = (slug) => slug.split("/")[0]

  mount.innerHTML = `
    <input type="search" class="title-search-input" placeholder="Search titles…" autocomplete="off" spellcheck="false" aria-label="Search titles">
    <ul class="title-search-results" hidden></ul>`
  const input = mount.querySelector("input")
  const list = mount.querySelector("ul")
  let selected = -1

  function render(results) {
    selected = -1
    if (results.length === 0) {
      list.hidden = true
      list.innerHTML = ""
      return
    }
    list.innerHTML = results
      .map(
        (e) =>
          `<li><a href="${base}/${e.slug}"${e.stub ? ' class="stub"' : ""}>` +
          `<span class="title">${escapeHtml(e.title)}</span>` +
          `<span class="folder">${escapeHtml(folderOf(e.slug))}${e.stub ? " · stub" : ""}</span></a></li>`,
      )
      .join("")
    list.hidden = false
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
  }

  function update() {
    if (!entries) {
      load().then(update)
      return
    }
    render(search(input.value))
  }

  function moveSelection(delta) {
    const items = list.querySelectorAll("li")
    if (items.length === 0) return
    items[selected]?.classList.remove("selected")
    selected = (selected + delta + items.length) % items.length
    items[selected].classList.add("selected")
    items[selected].scrollIntoView({ block: "nearest" })
  }

  input.addEventListener("focus", () => load())
  input.addEventListener("input", update)
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") (ev.preventDefault(), moveSelection(1))
    else if (ev.key === "ArrowUp") (ev.preventDefault(), moveSelection(-1))
    else if (ev.key === "Enter") {
      const a = list.querySelector(selected >= 0 ? "li.selected a" : "li a")
      if (a) window.location.href = a.href
    } else if (ev.key === "Escape") {
      input.value = ""
      render([])
      input.blur()
    }
  })
  document.addEventListener("click", (ev) => {
    if (!mount.contains(ev.target)) list.hidden = true
  })
  input.addEventListener("focus", () => {
    if (list.children.length) list.hidden = false
  })
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "/" && document.activeElement !== input && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) {
      ev.preventDefault()
      input.focus()
    }
  })

  const style = document.createElement("style")
  style.textContent = `
    #${mount.id} { position: relative; }
    .title-search-input { width: 100%; box-sizing: border-box; padding: 0.4rem 0.6rem; border: 1px solid var(--lightgray); border-radius: 5px; background: var(--light); color: var(--darkgray); font-family: var(--bodyFont); font-size: 0.95rem; }
    .title-search-input:focus { outline: none; border-color: var(--secondary); }
    .title-search-results { position: absolute; z-index: 999; left: 0; right: 0; margin: 0.25rem 0 0; padding: 0; list-style: none; max-height: 60vh; overflow-y: auto; background: var(--light); border: 1px solid var(--lightgray); border-radius: 5px; box-shadow: 0 6px 24px rgba(0,0,0,0.15); }
    .title-search-results li a { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.35rem 0.6rem; text-decoration: none; color: var(--dark); }
    .title-search-results li a.stub .title { color: var(--darkgray); }
    .title-search-results li a .folder { color: var(--gray); font-size: 0.8em; white-space: nowrap; }
    .title-search-results li:hover a, .title-search-results li.selected a { background: var(--highlight); }
  `
  document.head.appendChild(style)
})()
