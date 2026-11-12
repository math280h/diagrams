{
  const root = document.documentElement
  const systemBase = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem('dg:theme-boot') ?? 'null')
  } catch {
    saved = null
  }
  const base = saved && saved.mode !== 'system' ? saved.mode : systemBase
  const theme = saved && saved[base] && typeof saved[base].css === 'string' ? saved[base] : null
  root.dataset.appBase = theme ? theme.base : base
  root.classList.toggle('dark', root.dataset.appBase === 'dark')
  root.style.colorScheme = root.dataset.appBase
  if (theme) {
    root.dataset.appTheme = theme.id
    const style = document.createElement('style')
    style.id = 'dg-themes-boot'
    style.textContent = theme.css
    document.head.append(style)
  }
}
