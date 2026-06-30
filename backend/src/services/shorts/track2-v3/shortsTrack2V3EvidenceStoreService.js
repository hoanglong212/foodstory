export function createShortsTrack2V3EvidenceStore() {
  const evidence = []
  return {
    add(item) {
      if (item && typeof item === 'object') evidence.push(item)
      return evidence.length
    },
    list() {
      return [...evidence]
    },
    count() {
      return evidence.length
    },
  }
}

export function collectShortsTrack2V3Evidence() {
  return []
}
