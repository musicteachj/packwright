/**
 * Which pictogram a hazard classification requires.
 *
 * **Source.** Regulation (EC) No 1272/2008 (CLP), consolidated text
 * `02008R1272 — EN — 01.09.2025 — 029.003`, Annex V "Hazard pictograms",
 * retrieved 2026-09-11 from EUR-Lex `CELEX:02008R1272-20250901`. Column 1 gives
 * the pictogram, column 2 the hazard class and category; `description` below is
 * column 2 verbatim.
 *
 * **Why this exists at all.** Without it, pictogram precedence cannot be
 * enforced correctly — only guessed at. CLP Article 26(c) suppresses the
 * exclamation mark under the corrosion pictogram *only where the exclamation
 * mark is there for skin or eye irritation*, and 26(d) only for skin
 * sensitisation or skin and eye irritation. OSHA C.2.1.2 is conditional the same
 * way, on acute toxicity. A rule that fired on "GHS05 and GHS07 are both
 * present" would report violations that do not exist, under a real citation.
 * Knowing *why* each pictogram is on the label is the whole difference.
 *
 * It also inverts the model to match the regulation. A classification is the
 * input and the label elements are derived from it; asking a user for pictograms
 * directly is asking them to do the regulation's job and then checking their
 * arithmetic.
 *
 * **`pictogram: null` is a fact, not a gap.** Annex V lists classes for which no
 * pictogram is required — Explosives of Division 1.5, Flammable gases Category
 * 2, aquatic Chronic 3 and 4 among them. Recording them means "this hazard needs
 * no pictogram" is answerable, rather than indistinguishable from "this hazard
 * is unknown to us".
 *
 * **`id` is derived; `description` is the authority.** The ids are slugs built
 * from the section and the description so a label can reference a row stably.
 * Nothing regulatory depends on them — where the two could ever disagree, the
 * verbatim `description` is what the regulation says.
 */

import type { GhsPictogramCode } from './pictograms'

export interface HazardClassEntry {
  /** Stable reference, derived from `section` and `description`. */
  id: string
  /** CLP Annex I section, e.g. `3.2`. */
  section: string
  /** Annex V column 2, verbatim. */
  description: string
  /** Annex V column 1, or `null` where the annex states none is required. */
  pictogram: GhsPictogramCode | null
}

export const ANNEX_V_ENTRIES: readonly HazardClassEntry[] = [
  {
    id: '2.1/unstable-explosives-explosives-of-divisions-1-1-1-2-1-3',
    section: '2.1',
    description: 'Unstable explosives Explosives of Divisions 1.1, 1.2, 1.3, 1.4',
    pictogram: 'GHS01',
  },
  {
    id: '2.8/self-reactive-substances-and-mixtures-types-a-b',
    section: '2.8',
    description: 'Self reactive substances and mixtures, Types A, B',
    pictogram: 'GHS01',
  },
  {
    id: '2.15/organic-peroxides-types-a-b',
    section: '2.15',
    description: 'Organic peroxides, Types A, B',
    pictogram: 'GHS01',
  },
  {
    id: '2.2/flammable-gases-1a-1b',
    section: '2.2',
    description: 'Flammable gases, hazard categories 1A, 1B.',
    pictogram: 'GHS02',
  },
  {
    id: '2.3/aerosols-1-2',
    section: '2.3',
    description: 'Aerosols, hazard categories 1, 2',
    pictogram: 'GHS02',
  },
  {
    id: '2.6/flammable-liquids-1-2-3',
    section: '2.6',
    description: 'Flammable liquids, hazard categories 1, 2, 3',
    pictogram: 'GHS02',
  },
  {
    id: '2.7/flammable-solids-1-2',
    section: '2.7',
    description: 'Flammable solids, hazard categories 1, 2',
    pictogram: 'GHS02',
  },
  {
    id: '2.8/self-reactive-substances-and-mixtures-types-b-c-d-e-f',
    section: '2.8',
    description: 'Self-reactive substances and mixtures, Types B, C, D, E, F',
    pictogram: 'GHS02',
  },
  {
    id: '2.9/pyrophoric-liquids-1',
    section: '2.9',
    description: 'Pyrophoric liquids, hazard category 1',
    pictogram: 'GHS02',
  },
  {
    id: '2.10/pyrophoric-solids-1',
    section: '2.10',
    description: 'Pyrophoric solids, hazard category 1',
    pictogram: 'GHS02',
  },
  {
    id: '2.11/self-heating-substances-and-mixtures-1-2',
    section: '2.11',
    description: 'Self-heating substances and mixtures, hazard categories 1, 2',
    pictogram: 'GHS02',
  },
  {
    id: '2.12/substances-and-mixtures-which-in-contact-with-water-emit',
    section: '2.12',
    description:
      'Substances and mixtures, which in contact with water, emit flammable gases, hazard categories 1, 2, 3',
    pictogram: 'GHS02',
  },
  {
    id: '2.15/organic-peroxides-types-b-c-d-e-f',
    section: '2.15',
    description: 'Organic peroxides, Types B, C, D, E, F',
    pictogram: 'GHS02',
  },
  {
    id: '2.17/desensitised-explosives-1-2-3-4',
    section: '2.17',
    description: 'Desensitised explosives, hazard categories 1, 2, 3, 4',
    pictogram: 'GHS02',
  },
  {
    id: '2.4/oxidising-gases-1',
    section: '2.4',
    description: 'Oxidising gases, hazard category 1',
    pictogram: 'GHS03',
  },
  {
    id: '2.13/oxidising-liquids-1-2-3',
    section: '2.13',
    description: 'Oxidising liquids, hazard categories 1, 2, 3',
    pictogram: 'GHS03',
  },
  {
    id: '2.14/oxidising-solids-1-2-3',
    section: '2.14',
    description: 'Oxidising solids, hazard categories 1, 2, 3',
    pictogram: 'GHS03',
  },
  {
    id: '2.5/gases-under-pressure-compressed-gases-liquefied-gases-re',
    section: '2.5',
    description:
      'Gases under pressure: Compressed gases; Liquefied gases; Refrigerated liquefied gases; Dissolved gases',
    pictogram: 'GHS04',
  },
  {
    id: '2.16/corrosive-to-metals-1',
    section: '2.16',
    description: 'Corrosive to metals, hazard category 1',
    pictogram: 'GHS05',
  },
  {
    id: '3.1/acute-toxicity-oral-dermal-inhalation-1-2-3',
    section: '3.1',
    description: 'Acute toxicity (oral, dermal, inhalation), hazard categories 1, 2, 3',
    pictogram: 'GHS06',
  },
  {
    id: '3.2/skin-corrosion-1-and-sub-categories-1a-1b-1c',
    section: '3.2',
    description: 'Skin corrosion, hazard category 1 and sub-categories 1A, 1B, 1C',
    pictogram: 'GHS05',
  },
  {
    id: '3.3/serious-eye-damage-1',
    section: '3.3',
    description: 'Serious eye damage, hazard category 1',
    pictogram: 'GHS05',
  },
  {
    id: '3.1/acute-toxicity-oral-dermal-inhalation-4',
    section: '3.1',
    description: 'Acute toxicity (oral, dermal, inhalation), hazard category 4',
    pictogram: 'GHS07',
  },
  {
    id: '3.2/skin-irritation-2',
    section: '3.2',
    description: 'Skin irritation, hazard category 2',
    pictogram: 'GHS07',
  },
  {
    id: '3.3/eye-irritation-2',
    section: '3.3',
    description: 'Eye irritation, hazard category 2',
    pictogram: 'GHS07',
  },
  {
    id: '3.4/skin-sensitisation-1-1a-1b',
    section: '3.4',
    description: 'Skin sensitisation, hazard categories 1, 1A, 1B',
    pictogram: 'GHS07',
  },
  {
    id: '3.8/specific-target-organ-toxicity-single-exposure-3-respira',
    section: '3.8',
    description:
      'Specific Target Organ Toxicity — Single exposure, hazard category 3 Respiratory tract irritation Narcotic effects',
    pictogram: 'GHS07',
  },
  {
    id: '3.4/respiratory-sensitisation-1-1a-1b',
    section: '3.4',
    description: 'Respiratory sensitisation, hazard categories 1, 1A, 1B',
    pictogram: 'GHS08',
  },
  {
    id: '3.5/germ-cell-mutagenicity-1a-1b-2',
    section: '3.5',
    description: 'Germ cell mutagenicity, hazard categories 1A, 1B, 2',
    pictogram: 'GHS08',
  },
  {
    id: '3.6/carcinogenicity-1a-1b-2',
    section: '3.6',
    description: 'Carcinogenicity, hazard categories 1A, 1B, 2',
    pictogram: 'GHS08',
  },
  {
    id: '3.7/reproductive-toxicity-1a-1b-2',
    section: '3.7',
    description: 'Reproductive toxicity, hazard categories 1A, 1B, 2',
    pictogram: 'GHS08',
  },
  {
    id: '3.8/specific-target-organ-toxicity-single-exposure-1-2',
    section: '3.8',
    description: 'Specific Target Organ Toxicity — Single exposure, hazard categories 1, 2',
    pictogram: 'GHS08',
  },
  {
    id: '3.9/specific-target-organ-toxicity-repeated-exposure-1-2',
    section: '3.9',
    description: 'Specific Target Organ Toxicity — Repeated exposure, hazard categories 1, 2',
    pictogram: 'GHS08',
  },
  {
    id: '3.10/aspiration-hazard-1',
    section: '3.10',
    description: 'Aspiration hazard, hazard category 1',
    pictogram: 'GHS08',
  },
  {
    id: '4.1/hazardous-to-the-aquatic-environment-acute-acute-1-long',
    section: '4.1',
    description:
      'Hazardous to the aquatic environment — Acute hazard category: Acute 1 — Long-term hazard categories: Chronic 1, Chronic 2',
    pictogram: 'GHS09',
  },
  {
    id: '5.1/hazardous-to-the-ozone-layer-1',
    section: '5.1',
    description: 'Hazardous to the ozone layer, hazard category 1',
    pictogram: 'GHS07',
  },
  {
    id: '2.1/explosives-of-division-1-5',
    section: '2.1',
    description: 'Explosives of Division 1.5',
    pictogram: null,
  },
  {
    id: '2.1/explosives-of-division-1-6',
    section: '2.1',
    description: 'Explosives of Division 1.6',
    pictogram: null,
  },
  {
    id: '2.2/flammable-gases-2',
    section: '2.2',
    description: 'Flammable gases, hazard Category 2',
    pictogram: null,
  },
  {
    id: '2.3/aerosols-3',
    section: '2.3',
    description: 'Aerosols, hazard Category 3',
    pictogram: null,
  },
  {
    id: '2.8/self-reactive-substances-and-mixtures-type-g',
    section: '2.8',
    description: 'Self-reactive substances and mixtures, Type G',
    pictogram: null,
  },
  {
    id: '2.15/organic-peroxides-type-g',
    section: '2.15',
    description: 'Organic peroxides, Type G',
    pictogram: null,
  },
  {
    id: '3.7/reproductive-toxicity-effects-on-or-via-lactation-additi',
    section: '3.7',
    description: 'Reproductive toxicity, Effects on or via lactation, additional',
    pictogram: null,
  },
  {
    id: '4.1/hazardous-to-the-aquatic-environment-long-term-hazard',
    section: '4.1',
    description: 'Hazardous to the aquatic environment — Long-term hazard',
    pictogram: null,
  },
]

const BY_ID = new Map(ANNEX_V_ENTRIES.map((entry) => [entry.id, entry]))

export function hazardClassEntry(id: string): HazardClassEntry | undefined {
  return BY_ID.get(id)
}

/**
 * The pictograms a set of classifications requires, in Annex V order.
 *
 * Before precedence. Article 26 reduces this set, and reducing it is a rule's
 * job rather than the engine's — the engine draws what the classification
 * demands so that a label carrying too many pictograms can be reported instead
 * of silently corrected.
 */
export function requiredPictograms(hazardIds: readonly string[]): readonly GhsPictogramCode[] {
  const required = new Set<GhsPictogramCode>()
  for (const id of hazardIds) {
    const entry = BY_ID.get(id)
    if (entry?.pictogram) required.add(entry.pictogram)
  }
  // Annex V order, deduplicated: two classifications can demand the same
  // pictogram and it may appear only once (OSHA C.2.3.4 says so explicitly).
  const ordered: GhsPictogramCode[] = []
  for (const entry of ANNEX_V_ENTRIES) {
    if (entry.pictogram && required.has(entry.pictogram) && !ordered.includes(entry.pictogram)) {
      ordered.push(entry.pictogram)
    }
  }
  return ordered
}

/** Which of the given classifications put a particular pictogram on the label. */
export function hazardsRequiring(
  hazardIds: readonly string[],
  code: GhsPictogramCode,
): readonly HazardClassEntry[] {
  return hazardIds
    .map((id) => BY_ID.get(id))
    .filter((entry): entry is HazardClassEntry => entry?.pictogram === code)
}

/** Every id a document may reference. Exported so a schema can validate against it. */
export const HAZARD_CLASS_IDS: readonly string[] = ANNEX_V_ENTRIES.map((entry) => entry.id)

export function isHazardClassId(id: string): boolean {
  return BY_ID.has(id)
}
