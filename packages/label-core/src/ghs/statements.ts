/**
 * Hazard and precautionary statement text, per regulatory regime.
 *
 * **Never generated, never paraphrased.** These are codified strings: `H225` is
 * "Highly flammable liquid and vapour." exactly, always. A paraphrase produces a
 * non-compliant label, so every character here was extracted from the source
 * document and verified against it rather than written out.
 *
 * **Source — EU CLP.** Regulation (EC) No 1272/2008, consolidated text
 * `02008R1272 — EN — 01.09.2025 — 029.003`, retrieved 2026-09-11 from EUR-Lex
 * `CELEX:02008R1272-20250901`. Hazard statements from Annex III Part 1;
 * precautionary statements from Annex IV Part 2, except `P503` whose text
 * appears only in Annex IV Part 1 and is marked below.
 *
 * Extraction was verified two ways, because counting is not checking: every
 * string below appears verbatim in the source PDF, and every key appears in it
 * as a real heading. The second check is the one that matters — it caught a
 * fabricated code (`P370 + P380`) that the first had passed, created by a parser
 * that could not see CLP's bracketed optional components and so merged
 * `P370 + P380 + P375` with `P370 + P380 + P375 [+ P378]`, two different
 * statements with different text.
 *
 * **Why this is keyed by regime rather than shared.** The two regimes are not
 * the same standard with different spellings; they differ structurally, and the
 * differences are verified rather than assumed:
 *
 * - OSHA uses **eight** hazard symbols (29 CFR 1910.1200 App. C, C.2.3.2). CLP
 *   uses **nine** — it includes GHS09, the environment pictogram.
 * - OSHA suppresses the exclamation mark under the skull and crossbones only
 *   "where it is used for acute toxicity" (C.2.1.2). CLP Article 26(b) has no
 *   such qualifier.
 * - CLP Article 26(a) and 26(e) make a second pictogram *optional* in two cases.
 *   OSHA has no equivalent rule at all.
 * - OSHA permits "minor textual variations… spelling variations, synonyms" in
 *   precautionary statements (C.2.4.7). CLP grants no such latitude.
 *
 * A single shared table would therefore be wrong at the rule level, not merely
 * in wording.
 *
 * **The US tables are deliberately empty.** OSHA's own statement text lives in
 * the Appendix C.4 tables, which were not available in a form that could be
 * extracted and verified when this was written. They are declared and empty
 * rather than absent, and the lookups below **decline** rather than falling back
 * to the EU text — printing CLP wording on a US label is exactly the silent
 * substitution this file exists to prevent.
 */

export const GHS_REGIMES = ['eu-clp', 'us-osha'] as const
export type GhsRegime = (typeof GHS_REGIMES)[number]

/** CLP Annex III Part 1. */
export const EU_CLP_HAZARD_STATEMENTS: Readonly<Record<string, string>> = {
  H200: 'Unstable explosives.',
  H201: 'Explosive; mass explosion hazard.',
  H202: 'Explosive, severe projection hazard.',
  H203: 'Explosive; fire, blast or projection hazard.',
  H204: 'Fire or projection hazard.',
  H205: 'May mass explode in fire.',
  H206: 'Fire, blast or projection hazard; increased risk of explosion if desensitising agent is reduced.',
  H207: 'Fire or projection hazard; increased risk of explosion if desensitising agent is reduced.',
  H208: 'Fire hazard; increased risk of explosion if desensitising agent is reduced.',
  H220: 'Extremely flammable gas.',
  H221: 'Flammable gas.',
  H222: 'Extremely flammable aerosol.',
  H223: 'Flammable aerosol.',
  H224: 'Extremely flammable liquid and vapour.',
  H225: 'Highly flammable liquid and vapour.',
  H226: 'Flammable liquid and vapour.',
  H228: 'Flammable solid.',
  H229: 'Pressurised container: May burst if heated.',
  H230: 'May react explosively even in the absence of air.',
  H231: 'May react explosively even in the absence of air at elevated pressure and/or temperature.',
  H232: 'May ignite spontaneously if exposed to air.',
  H240: 'Heating may cause an explosion.',
  H241: 'Heating may cause a fire or explosion.',
  H242: 'Heating may cause a fire.',
  H250: 'Catches fire spontaneously if exposed to air.',
  H251: 'Self-heating: may catch fire.',
  H252: 'Self-heating in large quantities; may catch fire.',
  H260: 'In contact with water releases flammable gases which may ignite spontaneously.',
  H261: 'In contact with water releases flammable gases.',
  H270: 'May cause or intensify fire; oxidiser.',
  H271: 'May cause fire or explosion; strong oxidiser.',
  H272: 'May intensify fire; oxidiser.',
  H280: 'Contains gas under pressure; may explode if heated.',
  H281: 'Contains refrigerated gas; may cause cryogenic burns or injury.',
  H290: 'May be corrosive to metals.',
  H300: 'Fatal if swallowed.',
  H301: 'Toxic if swallowed.',
  H302: 'Harmful if swallowed.',
  H304: 'May be fatal if swallowed and enters airways.',
  H310: 'Fatal in contact with skin.',
  H311: 'Toxic in contact with skin.',
  H312: 'Harmful in contact with skin.',
  H314: 'Causes severe skin burns and eye damage.',
  H315: 'Causes skin irritation.',
  H317: 'May cause an allergic skin reaction.',
  H318: 'Causes serious eye damage.',
  H319: 'Causes serious eye irritation.',
  H330: 'Fatal if inhaled.',
  H331: 'Toxic if inhaled.',
  H332: 'Harmful if inhaled.',
  H334: 'May cause allergy or asthma symptoms or breathing difficulties if inhaled.',
  H335: 'May cause respiratory irritation.',
  H336: 'May cause drowsiness or dizziness.',
  H340: 'May cause genetic defects <state route of exposure if it is conclusively proven that no other routes of exposure cause the hazard>.',
  H341: 'Suspected of causing genetic defects <state route of exposure if it is conclusively proven that no other routes of exposure cause the hazard>.',
  H350: 'May cause cancer <state route of exposure if it is conclusively proven that no other routes of exposure cause the hazard>.',
  H351: 'Suspected of causing cancer <state route of exposure if it is conclusively proven that no other routes of exposure cause the hazard>.',
  H360: 'May damage fertility or the unborn child <state specific effect if known > <state route of exposure if it is conclusively proven that no other routes of exposure cause the hazard>.',
  H361: 'Suspected of damaging fertility or the unborn child <state specific effect if known> <state route of exposure if it is conclusively proven that no other routes of exposure cause the hazard>.',
  H362: 'May cause harm to breast-fed children.',
  H370: 'Causes damage to organs <or state all organs affected, if known> <state route of exposure if it is conclusively proven that no other routes of exposure cause the hazard>.',
  H371: 'May cause damage to organs <or state all organs affected, if known> <state route of exposure if it is conclusively proven that no other routes of exposure cause the hazard>.',
  H372: 'Causes damage to organs <or state all organs affected, if known> through prolonged or repeated exposure <state route of exposure if it is conclusively proven that no other routes of exposure cause the hazard>.',
  H373: 'May cause damage to organs <or state all organs affected, if known> through prolonged or repeated exposure <state route of exposure if it is conclusively proven that no other routes of exposure cause the hazard>.',
  H400: 'Very toxic to aquatic life.',
  H410: 'Very toxic to aquatic life with long lasting effects.',
  H411: 'Toxic to aquatic life with long lasting effects.',
  H412: 'Harmful to aquatic life with long lasting effects.',
  H413: 'May cause long lasting harmful effects to aquatic life.',
  H420: 'Harms public health and the environment by destroying ozone in the upper atmosphere',
}

/** CLP Annex IV Part 2, plus `P503` from Part 1. */
export const EU_CLP_PRECAUTIONARY_STATEMENTS: Readonly<Record<string, string>> = {
  P101: 'If medical advice is needed, have product container or label at hand.',
  P102: 'Keep out of reach of children.',
  P103: 'Read label before use.',
  P201: 'Obtain special instructions before use.',
  P202: 'Do not handle until all safety precautions have been read and understood.',
  P210: 'Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. No smoking.',
  P211: 'Do not spray on an open flame or other ignition source.',
  P212: 'Avoid heating under confinement or reduction of the desensitising agent.',
  P220: 'Keep away from clothing and other combustible materials.',
  P222: 'Do not allow contact with air.',
  P223: 'Do not allow contact with water.',
  P230: 'Keep wetted with…',
  P231: 'Handle and store contents under inert gas/…',
  'P231 + P232': 'Handle and store contents under inert gas/…. Protect from moisture.',
  P232: 'Protect from moisture.',
  P233: 'Keep container tightly closed.',
  P234: 'Keep only in original packaging.',
  P235: 'Keep cool.',
  P240: 'Ground and bond container and receiving equipment.',
  P241: 'Use explosion-proof [electrical/ventilating/ lighting/…] equipment.',
  P242: 'Use non-sparking tools.',
  P243: 'Take action to prevent static discharges.',
  P244: 'Keep valves and fittings free from oil and grease.',
  P250: 'Do not subject to grinding/shock/friction/ … .',
  P251: 'Do not pierce or burn, even after use.',
  P260: 'Do not breathe dust/fume/gas/mist/vapours/ spray.',
  P261: 'Avoid breathing dust/fume/gas/mist/vapours/ spray.',
  P262: 'Do not get in eyes, on skin, or on clothing.',
  P263: 'Avoid contact during pregnancy and while nursing.',
  P264: 'Wash … thoroughly after handling.',
  P270: 'Do not eat, drink or smoke when using this product.',
  P271: 'Use only outdoors or in a well-ventilated area.',
  P272: 'Contaminated work clothing should not be allowed out of the workplace.',
  P273: 'Avoid release to the environment.',
  P280: 'Wear protective gloves/protective clothing/eye protection/face protection.',
  P282: 'Wear cold insulating gloves and either face shield or eye protection.',
  P283: 'Wear fire resistant or flame retardant clothing.',
  P284: '[In case of inadequate ventilation] wear respiratory protection.',
  P301: 'IF SWALLOWED:',
  'P301 + P310': 'IF SWALLOWED: Immediately call a POISON CENTER/doctor/ …',
  'P301 + P312': 'IF SWALLOWED: Call a POISON CENTRE/ doctor/… if you feel unwell.',
  'P301 + P330 + P331': 'IF SWALLOWED: Rinse mouth. Do NOT induce vomiting.',
  P302: 'IF ON SKIN:',
  'P302 + P334': 'IF ON SKIN: Immerse in cool water or wrap in wet bandages.',
  'P302 + P335 + P334':
    'IF ON SKIN: Brush off loose particles from skin. Immerse in cool water [or wrap in wet bandages].',
  'P302 + P352': 'IF ON SKIN: Wash with plenty of water/…',
  P303: 'IF ON SKIN (or hair):',
  'P303 + P361 + P353':
    'IF ON SKIN (or hair): Take off immediately all contaminated clothing. Rinse skin with water [or shower].',
  P304: 'IF INHALED:',
  'P304 + P340': 'IF INHALED: Remove person to fresh air and keep comfortable for breathing.',
  P305: 'IF IN EYES:',
  'P305 + P351 + P338':
    'IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing.',
  P306: 'IF ON CLOTHING:',
  'P306 + P360':
    'IF ON CLOTHING: rinse immediately contaminated clothing and skin with plenty of water before removing clothes.',
  P308: 'IF exposed or concerned:',
  'P308 + P311': 'IF exposed or concerned: Call a POISON CENTER/doctor/ …',
  'P308 + P313': 'IF exposed or concerned: Get medical advice/ attention.',
  P310: 'Immediately call a POISON CENTER/doctor/ …',
  P311: 'Call a POISON CENTER/doctor/ …',
  P312: 'Call a POISON CENTRE/doctor/ … if you feel unwell.',
  P313: 'Get medical advice/attention.',
  P314: 'Get medical advice/attention if you feel unwell.',
  P315: 'Get immediate medical advice/attention.',
  P320: 'Specific treatment is urgent (see … on this label).',
  P321: 'Specific treatment (see … on this label).',
  P330: 'Rinse mouth.',
  P331: 'Do NOT induce vomiting.',
  P332: 'If skin irritation occurs:',
  'P332 + P313': 'If skin irritation occurs: Get medical advice/ attention.',
  P333: 'If skin irritation or rash occurs:',
  'P333 + P313': 'If skin irritation or rash occurs: Get medical advice/attention.',
  P334: 'Immerse in cool water [or wrap in wet bandages].',
  P335: 'Brush off loose particles from skin.',
  P336: 'Thaw frosted parts with lukewarm water. Do no rub affected area.',
  'P336 + P315':
    'Thaw frosted parts with lukewarm water. Do not rub affected area. Get immediate medical advice/attention.',
  P337: 'If eye irritation persists:',
  'P337 + P313': 'If eye irritation persists: Get medical advice/ attention.',
  P338: 'Remove contact lenses, if present and easy to do. Continue rinsing.',
  P340: 'Remove person to fresh air and keep comfortable for breathing.',
  P342: 'If experiencing respiratory symptoms:',
  'P342 + P311': 'If experiencing respiratory symptoms: Call a POISON CENTER/doctor/ …',
  P351: 'Rinse cautiously with water for several minutes.',
  P352: 'Wash with plenty of water/…',
  P353: 'Rinse skin with water [or shower].',
  P360: 'Rinse immediately contaminated clothing and skin with plenty of water before removing clothes.',
  P361: 'Take off immediately all contaminated clothing.',
  'P361 + P364': 'Take off immediately all contaminated clothing and wash it before reuse.',
  P362: 'Take off contaminated clothing.',
  'P362 + P364': 'Take off contaminated clothing and wash it before reuse.',
  P363: 'Wash contaminated clothing before reuse.',
  P364: 'And wash it before reuse.',
  P370: 'In case of fire:',
  'P370 + P372 + P380 + P373':
    'In case of fire: Explosion risk. Evacuate area. DO NOT fight fire when fire reaches explosives.',
  'P370 + P376': 'In case of fire: Stop leak if safe to do so.',
  'P370 + P378': 'In case of fire: Use… to extinguish.',
  'P370 + P380 + P375':
    'In case of fire: Evacuate area. Fight fire remotely due to the risk of explosion.',
  'P370 + P380 + P375 [+ P378]':
    'In case of fire: Evacuate area. Fight fire remotely due to the risk of explosion. [Use … to extinguish].',
  P371: 'In case of major fire and large quantities:',
  'P371 + P380 + P375':
    'In case of major fire and large quantities: Evacuate area. Fight fire remotely due to the risk of explosion.',
  P372: 'Explosion risk.',
  P373: 'DO NOT fight fire when fire reaches explosives.',
  P375: 'Fight fire remotely due to the risk of explosion.',
  P376: 'Stop leak if safe to do so.',
  P377: 'Leaking gas fire: Do not extinguish, unless leak can be stopped safely.',
  P378: 'Use… to extinguish.',
  P380: 'Evacuate area.',
  P381: 'In case of leakage, eliminate all ignition sources.',
  P390: 'Absorb spillage to prevent material damage.',
  P391: 'Collect spillage.',
  P401: 'Store in accordance with… .',
  P402: 'Store in a dry place.',
  'P402 + P404': 'Store in a dry place. Store in a closed container.',
  P403: 'Store in a well-ventilated place.',
  'P403 + P233': 'Store in a well-ventilated place. Keep container tightly closed.',
  'P403 + P235': 'Store in a well-ventilated place. Keep cool.',
  P404: 'Store in a closed container.',
  P405: 'Store locked up.',
  P406: 'Store in a corrosion-resistant/ … container with a resistant inner liner.',
  P407: 'Maintain air gap between stacks or pallets.',
  P410: 'Protect from sunlight.',
  'P410 + P403': 'Protect from sunlight. Store in a well-ventilated place.',
  'P410 + P412': 'Protect from sunlight. Do no expose to temperatures exceeding 50 o C/122 o F.',
  P411: 'Store at temperatures not exceeding … o C/… o F.',
  P412: 'Do not expose to temperatures exceeding 50 o C/122 o F.',
  P413: 'Store bulk masses greater than … kg/… lbs at temperatures not exceeding … o C/… o F.',
  P420: 'Store separately.',
  P501: 'Dispose of contents/container to …',
  P502: 'Refer to manufacturer or supplier for information on recovery or recycling.',
  P503: 'Refer to manufacturer/supplier/… for information on disposal/recovery/recycling',
}

/** 29 CFR 1910.1200 Appendix C.4 — not yet transcribed; see the file header. */
export const US_OSHA_HAZARD_STATEMENTS: Readonly<Record<string, string>> = {}

/** 29 CFR 1910.1200 Appendix C.4 — not yet transcribed; see the file header. */
export const US_OSHA_PRECAUTIONARY_STATEMENTS: Readonly<Record<string, string>> = {}

const HAZARD: Readonly<Record<GhsRegime, Readonly<Record<string, string>>>> = {
  'eu-clp': EU_CLP_HAZARD_STATEMENTS,
  'us-osha': US_OSHA_HAZARD_STATEMENTS,
}

const PRECAUTIONARY: Readonly<Record<GhsRegime, Readonly<Record<string, string>>>> = {
  'eu-clp': EU_CLP_PRECAUTIONARY_STATEMENTS,
  'us-osha': US_OSHA_PRECAUTIONARY_STATEMENTS,
}

/**
 * The statement text for a code under a regime, or `undefined`.
 *
 * `undefined` means this regime has no verified text for that code, and the
 * caller must say so rather than print something. It deliberately does **not**
 * fall back to another regime: a US label carrying EU wording would look
 * complete and be wrong, which is worse than a label that states plainly that a
 * statement could not be supplied.
 */
export function hazardStatementText(regime: GhsRegime, code: string): string | undefined {
  return HAZARD[regime][code]
}

export function precautionaryStatementText(regime: GhsRegime, code: string): string | undefined {
  return PRECAUTIONARY[regime][code]
}

/** Every code this build can supply text for, under the given regime. */
export function knownHazardStatementCodes(regime: GhsRegime): readonly string[] {
  return Object.keys(HAZARD[regime])
}

export function knownPrecautionaryStatementCodes(regime: GhsRegime): readonly string[] {
  return Object.keys(PRECAUTIONARY[regime])
}
