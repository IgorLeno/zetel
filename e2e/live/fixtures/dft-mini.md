# Teoria Funcional da Densidade — Resumo Sintético

Introdução concisa ao método DFT para modelagem de sistemas quânticos.
Este material cobre os fundamentos teóricos, as equações de Kohn-Sham,
a classificação de funcionais e o ciclo de auto-consistência.

## Fundamentos Teóricos

A Teoria Funcional da Densidade (DFT) baseia-se nos teoremas de Hohenberg-Kohn,
que provam que as propriedades do estado fundamental de um sistema de muitos
elétrons são determinadas unicamente pela densidade eletrônica $\rho(\mathbf{r})$.

O funcional de energia total pode ser escrito como:

$$E[\rho] = T[\rho] + V_{ne}[\rho] + J[\rho] + E_{xc}[\rho]$$

onde $T[\rho]$ é a energia cinética, $V_{ne}[\rho]$ é a interação
núcleo-elétron, $J[\rho]$ é a repulsão coulombiana clássica e
$E_{xc}[\rho]$ é o funcional de troca e correlação.

## Equações de Kohn-Sham

Na abordagem de Kohn-Sham, o problema de muitos corpos é mapeado em um sistema
de elétrons independentes sujeitos a um potencial efetivo $v_{KS}(\mathbf{r})$:

$$\left[-\frac{\hbar^2}{2m}\nabla^2 + v_{KS}(\mathbf{r})\right]\psi_i(\mathbf{r}) = \varepsilon_i\,\psi_i(\mathbf{r})$$

A densidade é reconstruída a partir dos orbitais de Kohn-Sham:

$$\rho(\mathbf{r}) = \sum_{i=1}^{N} |\psi_i(\mathbf{r})|^2$$

O potencial efetivo inclui contribuições do potencial externo, coulombiano
e de troca-correlação: $v_{KS} = v_{ext} + v_H + v_{xc}$.

## Funcionais de Troca e Correlação

A escolha do funcional $E_{xc}$ determina a qualidade dos resultados.
Os funcionais são classificados pela "escada de Jacob" (Jacob's ladder):

| Nível | Tipo      | Exemplo       | Inclui                       |
|-------|-----------|---------------|------------------------------|
| 1     | LDA       | VWN           | Densidade local              |
| 2     | GGA       | PBE, BLYP     | Gradiente de $\rho$          |
| 3     | Meta-GGA  | TPSS, M06-L   | Laplaciano / energia cinética|
| 4     | Híbrido   | B3LYP, PBE0   | Troca exata de HF (fração)   |

Funcionais híbridos incluem uma fração $a_0$ da troca exata de Hartree-Fock:
$E_{xc}^{hib} = a_0\,E_x^{HF} + (1-a_0)\,E_x^{DFA} + E_c^{DFA}$.

## Ciclo de Auto-Consistência (SCF)

O ciclo SCF (Self-Consistent Field) resolve iterativamente as equações de
Kohn-Sham até convergência:

1. Iniciar com densidade de tentativa $\rho^{(0)}(\mathbf{r})$ (ex.: superposição atômica).
2. Calcular o potencial efetivo $v_{KS}[\rho]$.
3. Resolver as equações de Kohn-Sham → orbitais $\psi_i$ e autovalores $\varepsilon_i$.
4. Calcular nova densidade $\rho^{(n+1)} = \sum_i |\psi_i|^2$.
5. Verificar convergência: $\|\rho^{(n+1)} - \rho^{(n)}\| < \epsilon$ (tipicamente $10^{-6}$).
6. Se não convergiu, misturar $\rho$ (mixing) e retornar ao passo 2.

## Glossário

- **Funcional**: mapeamento de uma função (a densidade) em um escalar (a energia).
- **LDA**: Local Density Approximation — assume densidade uniforme localmente.
- **GGA**: Generalized Gradient Approximation — inclui o gradiente $\nabla\rho$.
- **SCF**: Self-Consistent Field — ciclo iterativo de auto-consistência.
- **Orbital de Kohn-Sham**: autofunção do sistema fictício de elétrons independentes.
- **Potencial de troca-correlação**: $v_{xc}(\mathbf{r}) = \delta E_{xc}/\delta\rho(\mathbf{r})$.
