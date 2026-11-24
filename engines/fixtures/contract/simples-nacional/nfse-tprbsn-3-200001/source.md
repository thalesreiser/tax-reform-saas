# nfse_tpRBSNDiferenteDe1_valoresZerados

- Upstream test: [src/test/java/br/gov/serpro/rtc/testesintegracao/simplesnacional/SimplesNacionalNaoAssistidoControllerTest.java](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/blob/1.0.2/src/test/java/br/gov/serpro/rtc/testesintegracao/simplesnacional/SimplesNacionalNaoAssistidoControllerTest.java#L609), `SimplesNacionalNaoAssistidoControllerTest.nfse_tpRBSNDiferenteDe1_valoresZerados`.
- Tag: `1.0.2` (ReceitaFederal/calculadora-rtc-simples-nacional).
- The request is the one the test builds with its `linha()`, `item()`, `nfse()`, `crt()` and
  `itemCrt()` helpers (null fields dropped, as its `mapa` does). `expected.json` holds the test's
  `assertEquals` values; `isMissingNode`/`isNull` become `null` (absent or null).
- Parameters: cClassTrib 200001, tpRBSN 3, receita 10000.00 (`@CsvSource`).
