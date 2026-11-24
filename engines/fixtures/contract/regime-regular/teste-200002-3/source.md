# Teste_200002_3

- Upstream test: [src/test/java/br/gov/serpro/rtc/testesintegracao/calculoscorretos/cbsibs/cclasstrib_200002/Teste_200002_3.java](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/blob/1.7.2/src/test/java/br/gov/serpro/rtc/testesintegracao/calculoscorretos/cbsibs/cclasstrib_200002/Teste_200002_3.java#L44), `Teste_200002_3.testCalcularTributos`.
- Request: [src/test/resources/entradas/calculoscorretos/Teste_200002_3.json](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/blob/1.7.2/src/test/resources/entradas/calculoscorretos/Teste_200002_3.json), copied as published.
- Tag: `1.7.2` (ReceitaFederal/calculadora-rtc-regime-regular).
- The upstream test calls `CalculadoraService.calcularTributos`, the service behind `POST /regime-geral`.
  `expected.json` holds each `isEqualByComparingTo` of the test (`ZERO` as `0`) and each
  `isNull` as `null` (absent or null).
