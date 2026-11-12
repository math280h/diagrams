import { toast } from 'sonner'

/** Copies a text to the clipboard and tells the user with a toast. */
export function copyText(text: string, done = 'Copied') {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(done),
    () => toast.error('Could not copy. Select the text and copy it.'),
  )
}
