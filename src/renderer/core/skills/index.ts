/**
 * initializeSkills — Registers all built-in AI Skills with the SkillRegistry.
 *
 * Call this once at app startup (e.g. in main.ts or App.vue setup).
 */

import { SkillRegistry } from '../SkillRegistry'
import { CardRelevanceSkill } from './CardRelevanceSkill'
import { CoreNarrativeSkill } from './CoreNarrativeSkill'
import { InteractionCalibrationSkill } from './InteractionCalibrationSkill'
import { MemoryManagerSkill } from './MemoryManagerSkill'
import { SummarizationSkill } from './SummarizationSkill'
import { WorldbookExtractSkill } from './WorldbookExtractSkill'
import { CharacterVoiceSkill } from './CharacterVoiceSkill'
import { WorldStateTrackerSkill } from './WorldStateTrackerSkill'
import { ConflictDetectionSkill } from './ConflictDetectionSkill'
import { TurnPlanningSkill } from './TurnPlanningSkill'
import { RetrievalReviewSkill } from './RetrievalReviewSkill'
import { DirectiveCompilerSkill } from './DirectiveCompilerSkill'
import { ResponseReviewSkill } from './ResponseReviewSkill'

export function initializeSkills(): void {
  // Phase: context-assembly
  SkillRegistry.registerSkill(MemoryManagerSkill)
  SkillRegistry.registerSkill(TurnPlanningSkill)

  // Phase: standalone
  SkillRegistry.registerSkill(SummarizationSkill)
  SkillRegistry.registerSkill(WorldbookExtractSkill)

  // Phase: discovery
  SkillRegistry.registerSkill(CardRelevanceSkill)
  SkillRegistry.registerSkill(RetrievalReviewSkill)

  // Phase: pre-narrative
  SkillRegistry.registerSkill(CharacterVoiceSkill)
  SkillRegistry.registerSkill(DirectiveCompilerSkill)

  // Phase: narrative
  SkillRegistry.registerSkill(CoreNarrativeSkill)

  // Phase: post-narrative
  SkillRegistry.registerSkill(WorldStateTrackerSkill)
  SkillRegistry.registerSkill(ConflictDetectionSkill)
  SkillRegistry.registerSkill(InteractionCalibrationSkill)
  SkillRegistry.registerSkill(ResponseReviewSkill)

  console.log(`[SkillRegistry] Initialized ${SkillRegistry.getAllSkills().length} skills`)
}
