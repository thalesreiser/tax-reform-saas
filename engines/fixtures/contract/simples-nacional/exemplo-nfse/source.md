# EXEMPLO_NFSE (OpenAPI example "NFS-e — construção civil com isenção municipal")

- Request: `EXEMPLO_NFSE` in [src/main/java/br/gov/serpro/rtc/api/simplesnacional/controller/SimplesNacionalControllerOpenApi.java](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/blob/1.0.2/src/main/java/br/gov/serpro/rtc/api/simplesnacional/controller/SimplesNacionalControllerOpenApi.java#L33).
- Values: the example's summary, line 145 of the same file: "Regra 7 (tpBM 1): par sem
  redistribuição", i.e. rule `ISENCAO_MUNICIPAL` (as in `regra7_isencaoMunicipal`,
  [src/test/java/br/gov/serpro/rtc/testesintegracao/simplesnacional/SimplesNacionalNaoAssistidoControllerTest.java](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/blob/1.0.2/src/test/java/br/gov/serpro/rtc/testesintegracao/simplesnacional/SimplesNacionalNaoAssistidoControllerTest.java#L463)) with the Anexo III `semRedistribuicaoISS` pair of the request.
  Upstream does not publish the resulting amounts for this example, so none are asserted.
- Tag: `1.0.2` (ReceitaFederal/calculadora-rtc-simples-nacional).
