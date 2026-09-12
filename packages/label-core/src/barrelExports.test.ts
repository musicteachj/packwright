import { describe, expect, it } from 'vitest'
import * as geometryBarrel from './geometry/index'
import * as pdp from './geometry/pdp'
import * as symbol from './geometry/symbol'
import * as units from './geometry/units'
import * as applicationIdentifiers from './gs1/applicationIdentifiers'
import * as checkDigit from './gs1/checkDigit'
import * as digitalLink from './gs1/digitalLink'
import * as elementString from './gs1/elementString'
import * as gs1Barrel from './gs1/index'
import * as clearSpace from './layout/clearSpace'
import * as layoutOmissions from './layout/omissions'
import * as engine from './layout/engine'
import * as ghsEngine from './layout/ghsEngine'
import * as nutritionPanel from './layout/nutritionPanel'
import * as usFoodEngine from './layout/usFoodEngine'
import * as layoutBarrel from './layout/index'
import * as renderBarrel from './render/index'
import * as toPDF from './render/toPDF'
import * as toSVG from './render/toSVG'
import * as barHeight from './rules/gs1/barHeight'
import * as digitalLinkRule from './rules/gs1/digitalLink'
import * as gtinCheckDigitRule from './rules/gs1/gtinCheckDigit'
import * as humanReadableRule from './rules/gs1/humanReadable'
import * as magnificationRule from './rules/gs1/magnification'
import * as quietZoneRule from './rules/gs1/quietZone'
import * as ghsLabelDimensionsRule from './rules/ghs/labelDimensions'
import * as ghsPictogramIntegrityRule from './rules/ghs/pictogramIntegrity'
import * as ghsPictogramPrecedenceRule from './rules/ghs/pictogramPrecedence'
import * as ghsPictogramSetRule from './rules/ghs/pictogramSet'
import * as ghsPictogramSizeRule from './rules/ghs/pictogramSize'
import * as ghsSignalWordRule from './rules/ghs/signalWord'
import * as ghsSmallContainerRule from './rules/ghs/smallContainer'
import * as usFoodAllergenRule from './rules/usFood/allergens'
import * as usFoodContainsStatementTypeRule from './rules/usFood/containsStatementType'
import * as usFoodIngredientListRule from './rules/usFood/ingredientList'
import * as usFoodInformationPanelTypeSizeRule from './rules/usFood/informationPanelTypeSize'
import * as usFoodNetQuantityDualDeclarationRule from './rules/usFood/netQuantityDualDeclaration'
import * as usFoodNutritionFactsRule from './rules/usFood/nutritionFacts'
import * as usFoodNutritionFormatRule from './rules/usFood/nutritionFormat'
import * as usFoodNutritionTypeSizeRule from './rules/usFood/nutritionTypeSize'
import * as usFoodNetQuantityPlacementRule from './rules/usFood/netQuantityPlacement'
import * as usFoodNetQuantityPresentRule from './rules/usFood/netQuantityPresent'
import * as usFoodNetQuantitySeparationRule from './rules/usFood/netQuantitySeparation'
import * as usFoodNetQuantityTypeSizeRule from './rules/usFood/netQuantityTypeSize'
import * as usFoodResponsibleFirmRule from './rules/usFood/responsibleFirm'
import * as findingBuilders from './rules/finding'
import * as rulesBarrel from './rules/index'
import * as registry from './rules/registry'
import * as ruleTypes from './rules/types'
import * as constraints from './symbology/constraints'
import * as symbologyBarrel from './symbology/index'
import * as layOutSymbol from './symbology/layOutSymbol'
import * as fdaBarrel from './fda/index'
import * as fdaAllergens from './fda/allergens'
import * as fdaNutrients from './fda/nutrients'
import * as fdaNutritionPanel from './fda/nutritionPanel'
import * as fdaNutritionFormats from './fda/nutritionFormats'
import * as ghsBarrel from './ghs/index'
import * as ghsClassification from './ghs/classification'
import * as ghsLabelDimensions from './ghs/labelDimensions'
import * as ghsPictograms from './ghs/pictograms'
import * as ghsPrecedence from './ghs/precedence'
import * as ghsStatements from './ghs/statements'
import * as templatesBarrel from './templates/index'
import * as textBarrel from './text/index'
import * as textMeasure from './text/measure'
import * as textMetrics from './text/metrics'
import * as filename from './templates/filename'
import * as ghsTemplate from './templates/ghs'
import * as stock from './templates/stock'
import * as upcA from './templates/upcA'
import * as usFoodTemplate from './templates/usFood'

/**
 * Every public symbol must be reachable from its module's barrel.
 *
 * This exists because the gap it catches is invisible. `isNetQuantityZoneRequired`
 * was written, exported from `pdp.ts` and unit-tested via a direct import, so the
 * suite passed while the symbol was unreachable from `@packwright/label-core`. A
 * missing line in a barrel file produces no error anywhere until a consumer tries
 * to import it — and the consumer is usually a later phase.
 *
 * Checked against the modules as *loaded*, so it measures what a consumer can
 * actually import rather than what a regex can find in a file.
 *
 * Two limits, stated rather than left to look more complete than they are:
 *
 * 1. **Only runtime values.** Interfaces and type aliases are erased before this
 *    runs, so a type declared and never exported is not caught here. The reverse
 *    direction is covered by the compiler: `export type { Missing } from './x'`
 *    fails to build.
 * 2. **The module list is written out by hand.** An earlier version globbed the
 *    directory, which read as thorough but relied on `import.meta.glob` and so
 *    failed `tsc` under the deliberate `"types": []`. Explicit imports cost a
 *    line per file and are themselves type-checked — a deleted module fails to
 *    compile rather than silently dropping out of the sweep — but a *new* file
 *    still has to be added below.
 */

type Members = ReadonlyArray<readonly [file: string, module: object]>

const MODULES: ReadonlyArray<readonly [name: string, barrel: object, members: Members]> = [
  [
    'gs1',
    gs1Barrel,
    [
      ['applicationIdentifiers.ts', applicationIdentifiers],
      ['checkDigit.ts', checkDigit],
      ['digitalLink.ts', digitalLink],
      ['elementString.ts', elementString],
    ],
  ],
  [
    'geometry',
    geometryBarrel,
    [
      ['pdp.ts', pdp],
      ['symbol.ts', symbol],
      ['units.ts', units],
    ],
  ],
  [
    'layout',
    layoutBarrel,
    [
      ['clearSpace.ts', clearSpace],
      ['omissions.ts', layoutOmissions],
      ['engine.ts', engine],
      ['ghsEngine.ts', ghsEngine],
      ['usFoodEngine.ts', usFoodEngine],
      ['nutritionPanel.ts', nutritionPanel],
    ],
  ],
  [
    'render',
    renderBarrel,
    [
      ['toPDF.ts', toPDF],
      ['toSVG.ts', toSVG],
    ],
  ],
  [
    'symbology',
    symbologyBarrel,
    [
      ['constraints.ts', constraints],
      ['layOutSymbol.ts', layOutSymbol],
    ],
  ],
  [
    'fda',
    fdaBarrel,
    [
      ['allergens.ts', fdaAllergens],
      ['nutrients.ts', fdaNutrients],
      ['nutritionPanel.ts', fdaNutritionPanel],
      ['nutritionFormats.ts', fdaNutritionFormats],
    ],
  ],
  [
    'rules',
    rulesBarrel,
    [
      ['finding.ts', findingBuilders],
      ['registry.ts', registry],
      ['types.ts', ruleTypes],
      ['gs1/barHeight.ts', barHeight],
      ['gs1/digitalLink.ts', digitalLinkRule],
      ['gs1/gtinCheckDigit.ts', gtinCheckDigitRule],
      ['gs1/humanReadable.ts', humanReadableRule],
      ['gs1/magnification.ts', magnificationRule],
      ['gs1/quietZone.ts', quietZoneRule],
      ['ghs/labelDimensions.ts', ghsLabelDimensionsRule],
      ['ghs/pictogramIntegrity.ts', ghsPictogramIntegrityRule],
      ['ghs/pictogramPrecedence.ts', ghsPictogramPrecedenceRule],
      ['ghs/pictogramSet.ts', ghsPictogramSetRule],
      ['ghs/pictogramSize.ts', ghsPictogramSizeRule],
      ['ghs/signalWord.ts', ghsSignalWordRule],
      ['ghs/smallContainer.ts', ghsSmallContainerRule],
      ['usFood/netQuantityDualDeclaration.ts', usFoodNetQuantityDualDeclarationRule],
      ['usFood/netQuantityPlacement.ts', usFoodNetQuantityPlacementRule],
      ['usFood/netQuantityPresent.ts', usFoodNetQuantityPresentRule],
      ['usFood/netQuantitySeparation.ts', usFoodNetQuantitySeparationRule],
      ['usFood/netQuantityTypeSize.ts', usFoodNetQuantityTypeSizeRule],
      ['usFood/allergens.ts', usFoodAllergenRule],
      ['usFood/containsStatementType.ts', usFoodContainsStatementTypeRule],
      ['usFood/ingredientList.ts', usFoodIngredientListRule],
      ['usFood/nutritionFacts.ts', usFoodNutritionFactsRule],
      ['usFood/nutritionTypeSize.ts', usFoodNutritionTypeSizeRule],
      ['usFood/nutritionFormat.ts', usFoodNutritionFormatRule],
      ['usFood/informationPanelTypeSize.ts', usFoodInformationPanelTypeSizeRule],
      ['usFood/responsibleFirm.ts', usFoodResponsibleFirmRule],
    ],
  ],
  [
    'ghs',
    ghsBarrel,
    [
      ['classification.ts', ghsClassification],
      ['labelDimensions.ts', ghsLabelDimensions],
      ['pictograms.ts', ghsPictograms],
      ['precedence.ts', ghsPrecedence],
      ['statements.ts', ghsStatements],
    ],
  ],
  [
    'text',
    textBarrel,
    [
      ['measure.ts', textMeasure],
      ['metrics.ts', textMetrics],
    ],
  ],
  [
    'templates',
    templatesBarrel,
    [
      ['filename.ts', filename],
      ['ghs.ts', ghsTemplate],
      ['stock.ts', stock],
      ['upcA.ts', upcA],
      ['usFood.ts', usFoodTemplate],
    ],
  ],
]

describe('barrel exports', () => {
  it.each(MODULES)(
    '%s/index.ts re-exports every symbol in its module',
    (_name, barrel, members) => {
      const reachable = new Set(Object.keys(barrel))
      const missing = members
        .flatMap(([file, module]) =>
          Object.keys(module)
            .filter((name) => name !== 'default' && !reachable.has(name))
            .map((name) => `${file}: ${name}`),
        )
        .sort()

      expect(missing).toEqual([])
    },
  )
})
