/**
 * Core contracts shared by every part of the label engine.
 *
 * Units are never branded types — they are encoded in the field name instead
 * (`widthMm`, `heightIn`). Branding would be more rigorous but adds a
 * constructor call at every literal, and the naming convention is what the
 * packaging and prepress world already uses.
 */

// --- Symbologies -------------------------------------------------------------

/**
 * Every symbology this application can render. Lives here rather than beside
 * either consumer because both geometry (quiet zones) and symbology (input
 * constraints) key off it, and two drifting copies would be worse than one
 * shared import.
 */
export type SymbologyId =
  | 'UPC-A'
  | 'UPC-E'
  | 'EAN-13'
  | 'EAN-8'
  | 'ITF-14'
  | 'GS1-128'
  | 'CODE128'
  | 'CODE39'
  | 'MSI'
  | 'PHARMACODE'

// --- Compliance findings -----------------------------------------------------

/**
 * Severity levels map onto the ANSI Z535 scale printed on the labels this app
 * generates: DANGER red, WARNING orange, CAUTION yellow, NOTICE blue, green for
 * safety instructions.
 *
 * Two standards, and citing the wrong one is easy: **Z535.4** (Product Safety
 * Signs and Labels) defines the signal words and therefore the scale, while
 * **Z535.1** (Safety Colors) defines only the colours they are printed in.
 *
 * Colour lives in the web theme; the scale itself is domain. Colour never
 * carries meaning alone — every severity also has an icon and a text label.
 */
export type Severity = 'blocking' | 'violation' | 'advisory' | 'guidance' | 'pass'

export type Authority = 'GS1' | 'FDA' | 'OSHA' | 'EU'

export interface Citation {
  authority: Authority
  /** Exact reference, e.g. '21 CFR 101.7(i)' or 'GS1 GenSpec 5.2.3'. */
  reference: string
  /** Human-readable title of the cited provision. */
  title?: string
  url?: string
}

/** What was found against what the rule demands. Both pre-formatted for display. */
export interface Measurement {
  actual: string
  required: string
}

export interface Finding {
  /** Stable machine code, e.g. 'GS1_QUIET_ZONE_TOO_NARROW'. Never localised. */
  code: string
  severity: Severity
  /** One plain sentence stating the defect. */
  message: string
  citation: Citation
  /** Links the finding to an element in the resolved layout, for canvas highlighting. */
  elementId?: string
  measurement?: Measurement
  /**
   * What the verdict rests on — the printed artwork, or the document alone.
   *
   * `elementId` cannot answer this, and assuming it could was a bug. That field
   * says *where to look*; it does not say what was judged. An exemption under
   * 101.9(b)(12)(i)(C) points at the nutrition panel so the canvas can highlight
   * it, but what it reports is that this food is excused from carrying a second
   * column — which is true of the food whether or not the panel printed.
   *
   * It matters because a pass on `artwork` is withheld when the engine could not
   * draw the element it names, and a pass on `document` is not. Defaulting to
   * `artwork` is the safe direction: a wrong guess withholds a pass that was
   * earned, where the other way round certifies ink that was never laid down.
   */
  certifies?: 'artwork' | 'document'
}

// --- Extraction --------------------------------------------------------------

export interface BoundingBox {
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

export interface ExtractedField<T> {
  value: T
  /** 0–1. Surfaced to the user; never used to auto-accept a value. */
  confidence: number
  /** Where on the source image this came from, when the producer can say. */
  sourceRegion?: BoundingBox
}

export interface ExtractionWarning {
  code: string
  message: string
  /** Dotted path to the field this concerns, when it concerns one. */
  path?: string
}

/**
 * The modality-agnostic contract every extraction producer returns.
 *
 * A photo of a label produces one. A Safety Data Sheet PDF would produce one.
 * An eval harness scores anything that produces one. Defining it before the
 * first producer exists is what keeps later producers additive rather than a
 * refactor.
 *
 * Nothing here is label data yet — every field is unverified until a user
 * confirms it.
 */
export interface ExtractionResult<T> {
  fields: { [K in keyof T]?: ExtractedField<T[K]> }
  warnings: ExtractionWarning[]
}
