# Changelog

## [0.9.0](https://github.com/pblittle/fish-career/compare/v0.8.0...v0.9.0) (2026-10-09)


### Features

* **fetch:** an explicit window reconsiders postings dropped for their date ([#52](https://github.com/pblittle/fish-career/issues/52)) ([4e3a8e2](https://github.com/pblittle/fish-career/commit/4e3a8e2c7c8aa1e447fc1f900b58160e206586d5))
* **fetch:** skip-titles.txt, titles the operator never wants fetched ([#49](https://github.com/pblittle/fish-career/issues/49)) ([78d13f6](https://github.com/pblittle/fish-career/commit/78d13f61954a9749b273888803ad85beebbd1817))
* **recall:** fish recall, the known-item case log ([#48](https://github.com/pblittle/fish-career/issues/48)) ([4be86ef](https://github.com/pblittle/fish-career/commit/4be86ef9bc31879c76f52346bd39ae22936e546d))
* **watchlist:** a posting URL names a posting ([#47](https://github.com/pblittle/fish-career/issues/47)) ([7f3af38](https://github.com/pblittle/fish-career/commit/7f3af38879d2d8064e8b3b3e192fc39130f1278c))

### Bug Fixes

* validate posting IDs before filesystem access and tighten probe annotations ([#44](https://github.com/pblittle/fish-career/issues/44)) ([2b3318b](https://github.com/pblittle/fish-career/commit/2b3318bb144026697090bc6f42865851480799ad))
* **ats:** a Distributed posting is remote, and a SmartRecruiters link opens the job ([#51](https://github.com/pblittle/fish-career/issues/51)) ([bcbb2e6](https://github.com/pblittle/fish-career/commit/bcbb2e6fe1b0eb8937a7f009316ef35ccd984002))
* **ats:** lift a stated salary range when the board sends no compensation ([#57](https://github.com/pblittle/fish-career/issues/57)) ([786206d](https://github.com/pblittle/fish-career/commit/786206db54b060d02eb6e96c7cb6c5c15ece6e4b))
* **ats:** take remote and posted date from the provider's own fields ([#46](https://github.com/pblittle/fish-career/issues/46)) ([a186eca](https://github.com/pblittle/fish-career/commit/a186ecaf5d493cb25728075dade3e24f9c94265e))
* **cli:** the install step puts fish on PATH, and a rebuild keeps it ([#50](https://github.com/pblittle/fish-career/issues/50)) ([68795f8](https://github.com/pblittle/fish-career/commit/68795f85907322142fead6181ba5108595209101))
* **examples:** the LangGraph example runs on a fixed clock ([#53](https://github.com/pblittle/fish-career/issues/53)) ([3b9f4e9](https://github.com/pblittle/fish-career/commit/3b9f4e9c1c9188bc21b614965c9f9132e93bcf5f))
* **judge:** refuse unresolved secret references and fail loudly when triage scores nothing ([#56](https://github.com/pblittle/fish-career/issues/56)) ([b2a2ace](https://github.com/pblittle/fish-career/commit/b2a2ace78de332889397892e260c3dfa90a133b2))
* **judge:** reject a score off the dimension's criteria ladder ([#62](https://github.com/pblittle/fish-career/issues/62)) ([e0b514a](https://github.com/pblittle/fish-career/commit/e0b514a3f7177496eb62fc4ef7b0797ab17f1921))
* **ledger:** refuse to triage over a corrupt ledger ([#55](https://github.com/pblittle/fish-career/issues/55)) ([bd3ab27](https://github.com/pblittle/fish-career/commit/bd3ab2721ef3d8eca5d6bd88d7f0445942ee9143))
* **rank:** say the posting cache is empty when it is ([#61](https://github.com/pblittle/fish-career/issues/61)) ([035e401](https://github.com/pblittle/fish-career/commit/035e40135c0a398ef5be7426187e63332396cb5c))
* **stores:** refuse to write over unreadable watchlist entries, and write stores atomically ([#58](https://github.com/pblittle/fish-career/issues/58)) ([8ad2eae](https://github.com/pblittle/fish-career/commit/8ad2eae20727a07a488509a363656543fbf35ac5))
* **triage:** the skip list sets aside cached postings too ([#54](https://github.com/pblittle/fish-career/issues/54)) ([4dc4f33](https://github.com/pblittle/fish-career/commit/4dc4f337d3a5aa9c887762d1cc07f84c7a65efd8))

## [0.8.0](https://github.com/pblittle/fish-career/compare/v0.7.0...v0.8.0) (2026-09-28)


### Features

* **verdicts:** grade arrivals and measure finding quality ([#38](https://github.com/pblittle/fish-career/issues/38)) ([c0ff673](https://github.com/pblittle/fish-career/commit/c0ff6735227353fc9554dcb7c3311c021d724c38))

## [0.7.0](https://github.com/pblittle/fish-career/compare/v0.6.0...v0.7.0) (2026-09-27)


### Features

* **check:** enforce the engine's dependency boundary, and cover the example in the required check ([#34](https://github.com/pblittle/fish-career/issues/34)) ([40c8f37](https://github.com/pblittle/fish-career/commit/40c8f37887b94fa8e2ecd7795d956737f2bfa217))

## [0.6.0](https://github.com/pblittle/fish-career/compare/v0.5.0...v0.6.0) (2026-09-25)


### Features

* **eval:** measure ranking quality against a labeled dataset ([#24](https://github.com/pblittle/fish-career/issues/24)) ([5d34f49](https://github.com/pblittle/fish-career/commit/5d34f49b308fb80ce423f394c987245595fb72eb))
* **observability:** run-scoped traces and a LangSmith sink ([#26](https://github.com/pblittle/fish-career/issues/26)) ([25a7ccb](https://github.com/pblittle/fish-career/commit/25a7ccb0cd25fc442fb55854dc2445bd53aeb371))

## [0.5.0](https://github.com/pblittle/fish-career/compare/v0.4.0...v0.5.0) (2026-09-25)


### Features

* **mcp:** a typed contract: schemas, annotations, resources, prompts ([#19](https://github.com/pblittle/fish-career/issues/19)) ([2321482](https://github.com/pblittle/fish-career/commit/2321482031a5721c33bfb44da4e48ce928b20f31))

## [0.4.0](https://github.com/pblittle/fish-career/compare/v0.3.0...v0.4.0) (2026-09-25)


### Features

* **demo:** run the whole pipeline end to end with no credentials ([#7](https://github.com/pblittle/fish-career/issues/7)) ([6212a2e](https://github.com/pblittle/fish-career/commit/6212a2ee859682252f10ef2a0596142138329f29))

## [0.3.0](https://github.com/pblittle/fish-career/compare/v0.2.0...v0.3.0) (2026-09-23)


### Features

* **eval:** revealed preferences held to the ranking, with a golden slice in CI ([c1f30d1](https://github.com/pblittle/fish-career/commit/c1f30d1d0a28c425e360c3fc5a2128d6db680923))
* **fetch:** the four public ATS boards flattened to one posting shape, arrivals only ([cb81c8e](https://github.com/pblittle/fish-career/commit/cb81c8e9b5a1ab8d0083f2d72eafcfcebba52d8d))
* **mcp:** the fish server over stdio, and the host prompt that reads it ([4e54c28](https://github.com/pblittle/fish-career/commit/4e54c28f5fca346df7300e826fa5a79210c6d1c0))
* **triage:** the rubric as data, scored with retries, traces, and checkpoints ([2c9394f](https://github.com/pblittle/fish-career/commit/2c9394f17e26f486a7c5475b98c9364de01e05a5))
