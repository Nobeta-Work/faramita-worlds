import { SettingCard, CharacterCard } from '@shared/Interface'

export class LevelCalculator {
  static getLevelDisplay(level: number, setting: SettingCard, modeName?: string, suffixOnly: boolean = false) {
    const mode = modeName && setting.scaling_modes ? setting.scaling_modes[modeName] : null
    
    if (mode) {
      const index = Math.min(
        Math.floor((level - 1) / mode.step),
        mode.prefix_names.length - 1
      )
      const prefix = mode.prefix_names[index]
      return suffixOnly ? prefix : `${prefix}${setting.title || ''}`
    }

    if (setting.suffix_names && setting.step) {
      const index = Math.min(
        Math.floor((level - 1) / setting.step),
        setting.suffix_names.length - 1
      )
      const suffix = setting.suffix_names[index]
      return suffixOnly ? suffix : `${setting.title || ''}${suffix}`
    }

    return suffixOnly ? `${level}` : `${setting.title || '' } Lv.${level}`
  }

  static getCharacterFullTitle(character: CharacterCard, levelSetting: SettingCard | undefined, classSetting: SettingCard | undefined) {
    // If character has a manual prefix_name (title), use it directly
    if (character.prefix_name) {
      const classSuffix = classSetting 
        ? this.getLevelDisplay(character.level, classSetting, undefined, true)
        : character.class
      return `${character.prefix_name} ${classSuffix}`
    }

    let affiliationPrefix = ''
    
    if (levelSetting && levelSetting.scaling_modes) {
      let activeMode = levelSetting.default_mode
      
      // If character has affiliations, try to find a matching mode
      if (character.affiliation && character.affiliation.length > 0) {
        for (const aff of character.affiliation) {
          if (levelSetting.scaling_modes[aff]) {
            activeMode = aff
            break
          }
        }
      }

      if (activeMode && levelSetting.scaling_modes[activeMode]) {
        const mode = levelSetting.scaling_modes[activeMode]
        const index = Math.min(
          Math.floor((character.level - 1) / mode.step),
          mode.prefix_names.length - 1
        )
        affiliationPrefix = mode.prefix_names[index]
      }
    }

    const classSuffix = classSetting 
      ? this.getLevelDisplay(character.level, classSetting, undefined, true)
      : character.class

    if (affiliationPrefix) {
      return `${affiliationPrefix} ${classSuffix}`
    }
    
    return classSuffix
  }

  static calculateAttributeBonus(value: number) {
    return Math.floor((value - 10) / 2)
  }
}
