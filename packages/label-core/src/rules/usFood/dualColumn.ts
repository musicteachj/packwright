/**
 * A package that must carry a second column of nutrition information does.
 *
 * **Measured on the resolved layout.** Whether a panel carries a second column is
 * a question about what is printed, and asking the document instead let this rule
 * clear a tabular panel that declares `columns: dual` and draws one column.
 *
 * Source: 21 CFR 101.9(b)(12)(i) and (b)(2)(i)(D), read from the eCFR on
 * 2026-09-13. The thresholds, the band and the shared exemption set live in
 * `fda/nutritionFormats.ts`; this measures a label against them.
 *
 * **This is the first rule in the project that reports a label for *not* using a
 * display**, and every format rule before it is deliberately careful never to.
 * The difference is in the verbs. (j)(13)(ii) opens "may modify the
 * requirements" and 101.9(e) opens "Nutrition information **may** be presented
 * for two or more forms" — permissions, and a rule demanding either would report
 * violations that do not exist. (b)(12)(i) says a qualifying package "**must**
 * provide an additional column" and (b)(2)(i)(D) says the manufacturer "**shall**
 * provide" one. Those are obligations, and a rule silent about them would clear
 * a label the regulation does not.
 *
 * **It fires only on facts the label has asserted.** The trigger is a percentage
 * of "the applicable reference amount" from §101.12(b), a table this project does
 * not carry, so the figure is declared on the label and this rule declines
 * entirely when it is absent. Reporting a missing column on an inferred reference
 * amount would be the worst of both: a demand the user cannot check, resting on a
 * number this engine made up.
 *
 * **The exemptions are load-bearing, not decorative.** All three of
 * (b)(12)(i)(A), (B) and (C) apply to both provisions — (b)(2)(i)(D) says so in
 * its closing sentence — and without them the rule reports ordinary labels:
 * (A) alone excuses every package small enough for the reduced displays, which is
 * a large share of the ones that would otherwise qualify. Each exemption is
 * reported as a pass naming the paragraph that granted it, rather than as
 * silence, because a rule that declines invisibly is indistinguishable from one
 * that is broken.
 */

import { willDrawSecondColumn } from '../../layout/nutritionPanel'
import { DUAL_COLUMN_BASIS_REFERENCE } from '../../fda/nutritionFormats'
import type { DualColumnBasis, MandatoryDualColumnBasis } from '../../fda/nutritionFormats'
import { asDeclinedFacts, dualColumnDutyFor, stateThese } from './mandatoryColumns'
import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import type { Decline } from '../types'
import { finding, passedOnArtwork, passedOnDocument, untitled } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_DUAL_COLUMN_MISSING = 'FDA_DUAL_COLUMN_MISSING'
export const FDA_DUAL_COLUMN_MET = 'FDA_DUAL_COLUMN_MET'
export const FDA_DUAL_COLUMN_EXEMPT = 'FDA_DUAL_COLUMN_EXEMPT'
export const FDA_DUAL_COLUMN_BASIS_UNCONFIRMED = 'FDA_DUAL_COLUMN_BASIS_UNCONFIRMED'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(b)(12)(i)',
  title: 'A second column for a package holding 200 to 300 percent of the reference amount',
}

/**
 * The two bases that carry an obligation, as a value rather than only a type.
 *
 * A `Record<MandatoryDualColumnBasis, true>` rather than an array, because the
 * array form does not do what it appears to. `readonly MandatoryDualColumnBasis[]`
 * constrains what may go *in* and says nothing about what must: widening the
 * union leaves this compiling happily, and the rule would quietly stop declaring
 * the paragraph it had started reporting under. A record keyed on the union is
 * exhaustive, so adding a mandatory basis fails the build here.
 */
const MANDATORY_DUAL_COLUMN_BASES: Record<MandatoryDualColumnBasis, true> = {
  'per-container': true,
  'per-unit': true,
}

/** The same two as a list, taken from the record so the two cannot diverge. */
const mandatoryBases = (): readonly MandatoryDualColumnBasis[] =>
  Object.keys(MANDATORY_DUAL_COLUMN_BASES) as MandatoryDualColumnBasis[]

const BASIS_NAME = {
  'per-container': 'the entire package',
  'per-unit': 'the individual unit',
} as const

/** Every basis a label can declare, for saying what it drew instead. */
const DECLARED_NAME: Record<DualColumnBasis, string> = {
  'as-prepared': 'the food as prepared',
  combination: 'the food in combination',
  'per-unit-measure': 'a different unit of measure',
  'rdi-groups': 'another RDI group',
  'per-cup-popped': 'a cup of popped popcorn',
  'per-container': 'the entire package',
  'per-unit': 'the individual unit',
}

/** Whether both mandatory columns are owed at once — (b)(12)(i)'s and (b)(2)(i)(D)'s. */
const bothOwed = (duty: ReturnType<typeof dualColumnDutyFor>): boolean =>
  duty.standing['per-container'] === 'required' && duty.standing['per-unit'] === 'required'

/**
 * Where this tool stops and gives a notice instead of a verdict on the second column.
 *
 * Both columns owed, and the package a single unit — package and unit contents equal —
 * so the two would carry the same figures and whether one can serve as both is the open
 * question. Where they differ, one column cannot carry two sets of figures on any reading,
 * and a column is provably absent; review caught the first version of the notice firing
 * there too. And only for a column that could be either owed one.
 */
const limitApplies = (
  duty: ReturnType<typeof dualColumnDutyFor>,
  facts: NonNullable<UsFoodContext['data']['nutritionFacts']>,
): boolean =>
  // Both owed means both contents are stated — the duty reads them — so this compares
  // two figures, never two absences.
  bothOwed(duty) &&
  facts.packageContent === facts.unitContent &&
  couldBeEitherOwed(facts.columns?.basis)

/**
 * Whether a second column declared this way could be one of the two owed: counting the
 * package, counting the unit, or not saying. A column per 100 g, say, is neither on any
 * reading, so it is short a column and reported — the notice is not for it. The first
 * version of the notice fired whatever the column counted, and review caught it.
 */
const couldBeEitherOwed = (declared: DualColumnBasis | undefined): boolean =>
  declared === undefined || declared === 'per-container' || declared === 'per-unit'

/**
 * Whether the label shows a second column: drawn on the panel, or — for a panel printed
 * somewhere other than this label, such as beneath a (j)(14) lid — declared with figures.
 */
const secondColumnShown = (
  facts: NonNullable<UsFoodContext['data']['nutritionFacts']>,
  layout: UsFoodContext['layout'],
): boolean =>
  layout.elements.some((element) => element.elementId === US_FOOD_ELEMENTS.nutritionPanel)
    ? layout.elements.some(
        (element) => element.elementId === US_FOOD_ELEMENTS.nutritionSecondColumn,
      )
    : willDrawSecondColumn(facts)

export const usFoodDualColumnRule: UsFoodRule = {
  id: 'us-food/dual-column-required',
  title: 'A package holding 200 to 300 percent of its reference amount carries a second column.',
  citation: CITATION,
  /**
   * The basis decides which paragraph demands the column and the exemptions each
   * cite their own, so this rule ranges over both tables in
   * `fda/nutritionFormats`. Built from them rather than restated, because a
   * second copy of a table is a second copy to keep in step.
   */
  citations: [
    CITATION,
    ...[
      ...new Set([
        // **Only the bases this rule can actually report under.**
        // `DUAL_COLUMN_BASIS_REFERENCE` is keyed on every `DualColumnBasis`,
        // including the voluntary ones 101.9(e) permits, and `dualColumnDuty`
        // returns a `MandatoryDualColumnBasis` — two of the seven. Listing all
        // seven made this rule advertise 101.9(e)(5) and (b)(10)(iii), which it
        // has no path to emit: a catalogue entry claiming a check that never
        // runs, which is the same defect as a rule that can never fail. The
        // annotation is what keeps it honest — adding a mandatory basis widens
        // this list, and adding a voluntary one does not.
        ...Object.keys(MANDATORY_DUAL_COLUMN_BASES).map(
          (basis) => DUAL_COLUMN_BASIS_REFERENCE[basis as MandatoryDualColumnBasis],
        ),
        // The three exemptions `dualColumnDuty` can return. Written out because
        // it returns them from a chain of conditionals rather than a table, and
        // a rule may not report under a paragraph the catalogue does not list.
        '21 CFR 101.9(b)(12)(i)(A)',
        '21 CFR 101.9(b)(12)(i)(B)',
        '21 CFR 101.9(b)(12)(i)(C)',
      ]),
    ]
      .filter((reference) => reference !== CITATION.reference)
      .sort()
      .map((reference) => untitled(CITATION, reference)),
  ],
  codes: {
    [FDA_DUAL_COLUMN_MISSING]: ['violation'],
    [FDA_DUAL_COLUMN_MET]: ['pass'],
    [FDA_DUAL_COLUMN_EXEMPT]: ['pass'],
    [FDA_DUAL_COLUMN_BASIS_UNCONFIRMED]: ['advisory'],
  },
  appliesTo: 'us-food',

  /**
   * The facts this rule cannot proceed without, named so a user can supply them.
   *
   * §101.12(b)'s reference amounts are not carried here, so a label that states
   * none has not been cleared of anything — it has not been asked. That was
   * silence until now, and silence beside a clean report reads as approval.
   */
  declines({ data, layout, stock }: UsFoodContext): Decline | undefined {
    if (data.nutritionFacts === undefined) return undefined
    const duty = dualColumnDutyFor(data, stock)

    // **Both columns owed, one drawn: the tool's limit, said as such.** (b)(12)(i) asks for
    // a column for the entire package and (b)(2)(i)(D) for one per individual unit, and
    // this tool draws one second column of one basis. Each basis drew a violation citing
    // the other paragraph, so no setting satisfied the report — the tool's limit, laid on
    // the label. Read from the eCFR on 2026-10-08: neither paragraph, nor (e)(6), which
    // frames each as a two-column presentation, says whether one second column can serve
    // as both where both carry the same figures — a package that is a single unit. So
    // `check` judges nothing here and this says why. Where no second column is drawn, or the
    // package and unit differ, a column is missing on any reading and `check` reports it.
    if (limitApplies(duty, data.nutritionFacts) && secondColumnShown(data.nutritionFacts, layout)) {
      return {
        reason:
          'Both 21 CFR 101.9(b)(12)(i) and 101.9(b)(2)(i)(D) reach this package: it and its ' +
          'individual unit each hold between 200 and 300 percent of the reference amount. The ' +
          'first asks for a second column for the entire package and the second for one per ' +
          'individual unit — and the package is a single unit, so the two would carry the same ' +
          'figures. Neither paragraph, nor 101.9(e)(6), says whether one second column can serve as ' +
          'both. This tool draws one second column and does not decide that question, so it ' +
          'gives no verdict on the second column here. That is a limit of this tool, not a ' +
          'fault found in your label.',
        wants: [],
        limit: true,
      }
    }

    // A duty of any kind means `check` had something to say — the column is
    // owed, met or excused — so the rule ran and there is nothing to declare.
    if (duty.basis !== undefined) return undefined

    // Keyed on the **package** provision alone. (b)(2)(i)(D) reads a unit
    // content, and a product with no discrete units has none to state, so a
    // label that answered (b)(12)(i) in full is not left hanging by the
    // per-unit question — treating it as a decline would nag every bag of
    // granola about a figure it cannot have.
    if (duty.standing['per-container'] !== 'undetermined') return undefined

    return {
      reason:
        'This label has not stated everything 101.9(b)(12)(i) turns on — a reference amount, ' +
        'what the whole package holds, and whether it is packaged and sold individually — so ' +
        'whether a second column of nutrition information is required cannot be told. ' +
        `${stateThese(duty.unstated['per-container'])} and this check will run. ` +
        '(b)(2)(i)(D) asks the same of an individual unit, where the product has them.',
      wants: asDeclinedFacts(duty.unstated['per-container']),
    }
  },

  check({ data, layout, stock }: UsFoodContext): Finding[] {
    const panel = data.nutritionFacts
    if (panel === undefined) return []

    // Assembled in `mandatoryColumns.ts`, because two other rules need the same
    // answer to decide whether (e)(6) reaches the column they are judging.
    const duty = dualColumnDutyFor(data, stock)

    // No duty is nothing to report. A label outside the band, or one that never
    // stated its reference amount, has not been cleared of anything — it has not
    // been asked.
    if (duty.basis === undefined) return []

    const reference = DUAL_COLUMN_BASIS_REFERENCE[duty.basis]
    const percent = duty.percentOfReferenceAmount!.toFixed(0)

    if (duty.exemption !== undefined) {
      return [
        // On the document, not the artwork: the message below says so itself.
        // An exemption is a fact about the product, so it survives a panel the
        // engine could not draw — and withholding it there would leave the
        // label saying nothing at all about a column it was never required to
        // carry.
        passedOnDocument(
          usFoodDualColumnRule,
          FDA_DUAL_COLUMN_EXEMPT,
          `This package holds ${percent} percent of its reference amount, which would require a ` +
            `second column for ${BASIS_NAME[duty.basis]} — but ${duty.exemption} excuses it. ` +
            'Whether that exemption applies is a fact about the product, not about the label, ' +
            'and is not checked here.',
          US_FOOD_ELEMENTS.nutritionPanel,
          { ...CITATION, reference: duty.exemption },
        ),
      ]
    }

    // **No panel drawn at all, and the column is still owed.** Only (j)(14) reaches this: an
    // egg carton's information is presented beneath the lid or in an insert, and a panel run
    // off the stock still records its elements. The layout has no column to read, and
    // "the panel as drawn carries one column" would describe a panel not on the label. But
    // (j)(14) moves the required information rather than excusing it, so the column is
    // judged on the figures declared for it: whether a second column is asked for and given
    // figures, which is all `willDrawSecondColumn` asks. Not whether this engine could draw it
    // in the display declared — the dual-column tabular display is one (e)(6)(ii) illustrates
    // and this engine has not built, and a carton presenting it beneath the lid breaks no
    // rule by that. A column declared is not certified, because nothing here printed it; the
    // pass that would say so is simply not issued. The first cut of this returned nothing
    // either way, and its review found it excusing a column the regulation still demands.
    // **Which owed column is not on this label.** Both provisions name what their
    // column must carry — (b)(12)(i) one "for the entire package", (b)(2)(i)(D)
    // one "per individual unit" — so a label owing the second and drawing the
    // first has not provided what was asked for.
    //
    // Computed as a set difference rather than an equality, because both can be
    // owed at once: a package in the band whose individual unit is also in it
    // owes two additional columns, and this document model holds one `basis` and
    // one set of `secondAmounts`. The first version checked only that the declared
    // basis was *among* those required and certified the lot. Found by review.
    //
    // **Where both are owed, the package is a single unit, and the column drawn could
    // be either, nothing here judges it** — `declines` says why, and `limitApplies`
    // says exactly when. This comment used to say every such label must be reported;
    // the eCFR, read on 2026-10-08, does not say one column cannot serve as both where
    // both carry the same figures, so reporting it blamed the label for this tool's
    // limit. Different figures, a column that could be neither, or no column at all
    // are still reported.
    const declared = panel.columns?.basis
    // Derived from the record rather than written out again beside it: the note on
    // `MANDATORY_DUAL_COLUMN_BASES` sets out why the array form gives no
    // exhaustiveness guarantee, and a second tuple would keep compiling on the
    // day the union widened and the record did not.
    const owedButNotDrawn = mandatoryBases().filter(
      (basis) => duty.standing[basis] === 'required' && basis !== declared,
    )

    // Named and cited for the column that is **missing**, not for the one the duty
    // happened to report first. `reference` comes from `duty.basis`, where the
    // package provision always wins — so a finding about an absent per-unit column
    // was carrying (b)(12)(i), which is the other paragraph. A citation that does
    // not govern the sentence beside it is the defect this project treats most
    // seriously, and review caught it here.
    const missingNames =
      owedButNotDrawn.length === 0
        ? BASIS_NAME[duty.basis]
        : owedButNotDrawn.map((basis) => BASIS_NAME[basis]).join(' and ')
    const missingReference =
      owedButNotDrawn.length === 1
        ? DUAL_COLUMN_BASIS_REFERENCE[owedButNotDrawn[0]!]
        : owedButNotDrawn.length === 0
          ? reference
          : CITATION.reference

    // **The limit, in one place, by the same test `declines` uses**, so the two cannot
    // drift: a `check` that judged here would suppress the decline, and one that fell
    // silent where `declines` did not would be a pass nobody issued. It was three
    // tests in three branches until review.
    if (limitApplies(duty, panel) && secondColumnShown(panel, layout)) return []

    // Where both are owed and the package and its unit are stated differently, the two
    // columns would carry different figures — so the cause of the shortfall is the
    // figures, and the message says so rather than leaving a user to find a half-gram.
    const unit = panel.referenceAmount?.unit ?? 'g'
    const statedApart =
      bothOwed(duty) && panel.packageContent !== panel.unitContent
        ? ` The package (${panel.packageContent} ${unit}) and its unit (${panel.unitContent} ` +
          `${unit}) are stated differently, so the two columns would carry different figures ` +
          'and one second column cannot carry both.'
        : ''

    if (!layout.elements.some((element) => element.elementId === US_FOOD_ELEMENTS.nutritionPanel)) {
      if (willDrawSecondColumn(panel) && declared !== undefined && owedButNotDrawn.length === 0) {
        return []
      }
      // Unstated, and one column owed: the form rule's question. Two owed with figures
      // that differ is a column provably absent, which this branch fell silent on.
      if (willDrawSecondColumn(panel) && declared === undefined && owedButNotDrawn.length <= 1) {
        return []
      }

      // Two shapes of shortfall and they are not the same fact. A carton
      // declaring one column is short a column; one declaring two where the
      // second counts the wrong thing has both, and saying it "carries one
      // column" would be untrue on the page. The on-label branch got a message
      // of its own for this and this one did not, which review caught.
      const declaresTwo = willDrawSecondColumn(panel)
      return [
        finding(usFoodDualColumnRule, {
          code: FDA_DUAL_COLUMN_MISSING,
          severity: 'violation',
          message:
            `This package holds ${percent} percent of its reference amount, so its nutrition ` +
            `information must carry a second column for ${missingNames} beside the one per ` +
            'serving. ' +
            (!declaresTwo
              ? 'The information declared for presentation off this label carries one ' +
                `column${panel.columns?.mode === 'dual' ? ', though the label asks for two' : ''}.`
              : declared === undefined
                ? 'The information declared for presentation off this label carries a second ' +
                  'column without saying what it counts.' +
                  statedApart
                : `The information declared for presentation off this label carries a second ` +
                  `column, but says it counts ${DECLARED_NAME[declared]} — which is not the ` +
                  `column ${missingReference} asks for.` +
                  statedApart),
          measurement: {
            actual: !declaresTwo
              ? 'one column declared'
              : declared === undefined
                ? 'one second column of unstated basis'
                : `a second column for ${DECLARED_NAME[declared]}`,
            required: `a second column for ${missingNames}`,
          },
          elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
          citation: { ...CITATION, reference: missingReference },
        }),
      ]
    }

    // **Asked of the layout, not of the document.** This read `columns.mode` and
    // reported the column present on a tabular panel that draws a single one —
    // certifying content the engine never printed, which is the failure
    // `layout/types.ts` records learning the hard way with the GHS pictograms.
    // What a package carries is a question about what was drawn on it.
    const drawn = layout.elements.some(
      (element) => element.elementId === US_FOOD_ELEMENTS.nutritionSecondColumn,
    )

    if (!drawn) {
      return [
        finding(usFoodDualColumnRule, {
          code: FDA_DUAL_COLUMN_MISSING,
          severity: 'violation',
          message:
            `This package holds ${percent} percent of its reference amount, so the panel must ` +
            `carry a second column for ${BASIS_NAME[duty.basis]} beside the one per serving. ` +
            `The panel as drawn carries one column${
              panel.columns?.mode === 'dual' ? ', though the label asks for two' : ''
            }.`,
          measurement: {
            actual: 'one column',
            required: `a second column for ${BASIS_NAME[duty.basis]}`,
          },
          elementId: US_FOOD_ELEMENTS.nutritionPanel,
          citation: { ...CITATION, reference },
        }),
      ]
    }

    // One second column cannot carry two sets of figures, so where the package and its
    // unit differ and both are owed, a column is provably absent whatever the label says
    // its one counts — including where it says nothing. Without this, omitting the basis
    // bought a downgrade from violation to advisory on a label that is certainly short.
    if (declared === undefined && owedButNotDrawn.length <= 1) {
      return [
        finding(usFoodDualColumnRule, {
          code: FDA_DUAL_COLUMN_BASIS_UNCONFIRMED,
          severity: 'advisory',
          message:
            `This package holds ${percent} percent of its reference amount, so ${reference} ` +
            `requires a second column for ${BASIS_NAME[duty.basis]}. The panel draws a second ` +
            'column and the label does not say what it counts, so this check cannot confirm it ' +
            'is that one. State what the second column counts.',
          measurement: {
            actual: 'a second column of unstated basis',
            required: `a second column for ${BASIS_NAME[duty.basis]}`,
          },
          elementId: US_FOOD_ELEMENTS.nutritionPanel,
          citation: { ...CITATION, reference },
        }),
      ]
    }

    if (owedButNotDrawn.length > 0) {
      return [
        finding(usFoodDualColumnRule, {
          code: FDA_DUAL_COLUMN_MISSING,
          severity: 'violation',
          message:
            `This package holds ${percent} percent of its reference amount, so it requires a ` +
            `second column for ${missingNames}. The panel draws a second column, but ` +
            // Unstated, with a column missing, is only reachable where both are owed and
            // the figures differ, so `statedApart` always follows to say why.
            (declared === undefined
              ? 'it does not say what it counts.'
              : `the label says it counts ${DECLARED_NAME[declared]} — which is not the column ` +
                `${missingReference} asks for.`) +
            statedApart,
          measurement: {
            actual:
              declared === undefined
                ? 'one second column of unstated basis'
                : `a second column for ${DECLARED_NAME[declared]}`,
            required: `a second column for ${missingNames}`,
          },
          elementId: US_FOOD_ELEMENTS.nutritionPanel,
          citation: { ...CITATION, reference: missingReference },
        }),
      ]
    }

    return [
      // (b)(12)(i): the package "must provide an additional column" — printed, so the artwork.
      //
      // **It claims presence and nothing else.** This rule asks whether a second column was
      // drawn; what that column has to carry is (e)'s question and `us-food/dual-column-form`
      // answers it. The message used to say the panel "carries the second column (b)(12)(i)
      // requires", which is a claim about content — and it now reaches documents whose second
      // column declares one nutrient of fourteen, where the form rule reports it incomplete on
      // the same label. A pass has to say only what its own rule measured.
      passedOnArtwork(
        usFoodDualColumnRule,
        FDA_DUAL_COLUMN_MET,
        `This package holds ${percent} percent of its reference amount, which ${reference} ` +
          'requires a second column for, and the panel prints one. Whether that column carries ' +
          'everything the paragraph asks of it is checked separately.',
        US_FOOD_ELEMENTS.nutritionPanel,
        { ...CITATION, reference },
      ),
    ]
  },
}
