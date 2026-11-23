export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Asks the user for a folder and returns the files in it and in its subfolders. Call it from a click. */
export function pickFolderFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.addEventListener('change', () => resolve([...(input.files ?? [])]), { once: true })
    input.addEventListener('cancel', () => resolve([]), { once: true })
    input.click()
  })
}

function chooseFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.addEventListener('change', () => resolve([...(input.files ?? [])]), { once: true })
    input.addEventListener('cancel', () => resolve([]), { once: true })
    input.click()
  })
}

/** Asks the user for one or more files. Call it from a click. */
export function pickFiles(accept: string): Promise<File[]> {
  return chooseFiles(accept, true)
}

export async function pickFile(accept: string): Promise<File | null> {
  return (await chooseFiles(accept, false))[0] ?? null
}
