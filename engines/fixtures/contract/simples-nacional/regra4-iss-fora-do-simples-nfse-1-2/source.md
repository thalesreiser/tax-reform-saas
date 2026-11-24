# regra4_issForaDoSimples_nfse

- Upstream test: [src/test/java/br/gov/serpro/rtc/testesintegracao/simplesnacional/SimplesNacionalNaoAssistidoControllerTest.java](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/blob/1.0.2/src/test/java/br/gov/serpro/rtc/testesintegracao/simplesnacional/SimplesNacionalNaoAssistidoControllerTest.java#L409), `SimplesNacionalNaoAssistidoControllerTest.regra4_issForaDoSimples_nfse`.
- Tag: `1.0.2` (ReceitaFederal/calculadora-rtc-simples-nacional).
- The request is the one the test builds with its `linha()`, `item()`, `nfse()`, `crt()` and
  `itemCrt()` helpers (null fields dropped, as its `mapa` does). `expected.json` holds the test's
  `assertEquals` values; `isMissingNode`/`isNull` become `null` (absent or null).
- Parameters: regApIBSCBSSN 1, regApTribSN 2 (`@CsvSource`).
