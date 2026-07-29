# FoodStory Final Source Archive Metadata

- Filename: `FoodStory_Final_Source_03510c93.zip`
- Authoritative commit: `03510c934d89daef1443b2dc48be8a3a7c2ca6e3`
- Exact byte size: `55,542,681` bytes
- MiB size: `52.969628 MiB` (bytes / 1,048,576)
- SHA-256: `a6e2ad52f3d4fb4248b48869ffa62c5543e5d11e264959d22ea900f153514591`
- Total ZIP entries: `834`
- File entries: `784`
- Directory entries: `50`
- ZIP integrity: PASS
- Every-entry read verification: PASS
- Safe path verification: PASS
- Forbidden/sensitive-file scan: PASS
- Likely real-secret scan: PASS
- Clean extraction: PASS
- Expected frontend/backend/documentation structure: PASS
- Report DOCX/PDF and report-input DOCX excluded: yes

The archive was created directly from the authoritative Git commit. The
committed report input at
`docs/report-input/FoodStory_COS30043_EvidenceReconciled_SubmissionDraft_v7.docx`
was explicitly excluded because the final report is submitted separately.

The same exclusion rule was extended to the built report itself, which the
evidence commit `be95424` had added to the repository: the archive omits
`docs/FoodStory_COS30043_Final_Report_ArchiveVerified_VideoPending.docx`,
its exported PDF, and the Word owner file
`docs/~$odStory_COS30043_Final_Report_ArchiveVerified_VideoPending.docx`.
The report is submitted as a separate document, and the owner file is a
Word editing artefact rather than project source.

The packaging method is reproducible. Rebuilding the previous archive from
commit `0473287788bad6a098f1d2724ec0e3d0c81bd412` with the same command
returned byte size `55,496,926` and SHA-256
`3d66a5f34ac2bbc854c0ce4104c89a85a523385b33216bf4cc60b5d0d2d23e1d`,
matching the recorded values exactly.
