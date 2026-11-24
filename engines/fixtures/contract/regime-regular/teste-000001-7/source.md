# Teste_000001_7

- Upstream test: [src/test/java/br/gov/serpro/rtc/testesintegracao/calculoscorretos/cbsibs/cclasstrib_000001/Teste_000001_7.java](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/blob/1.7.2/src/test/java/br/gov/serpro/rtc/testesintegracao/calculoscorretos/cbsibs/cclasstrib_000001/Teste_000001_7.java#L42), `Teste_000001_7.testCalcularTributos`.
- Request: [src/test/resources/entradas/calculoscorretos/Teste_000001_7.json](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/blob/1.7.2/src/test/resources/entradas/calculoscorretos/Teste_000001_7.json), copied as published.
- Tag: `1.7.2` (ReceitaFederal/calculadora-rtc-regime-regular).
- The upstream test calls `CalculadoraService.calcularTributos`, the service behind `POST /regime-geral`.
  `expected.json` holds each `isEqualByComparingTo` of the test (`ZERO` as `0`) and each
  `isNull` as `null` (absent or null).
