import { CAPTION_STYLES, type CaptionStyle } from '@/model/schema'

export const CAPTION_STYLE_NAMES: Record<CaptionStyle, string> = {
  callout: 'Callout',
  subtitle: 'Subtitle',
  bottom: 'Bottom bar',
  top: 'Top bar',
  none: 'Hidden',
}

export const CAPTION_STYLE_OPTIONS = CAPTION_STYLES.map((value) => ({ value, label: CAPTION_STYLE_NAMES[value] }))
