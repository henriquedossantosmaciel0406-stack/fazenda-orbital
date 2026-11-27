# Fazenda Orbital

Jogo de fazenda em primeira pessoa, feito em Three.js para navegador de computador.

## Abrir o jogo e jogar com amigos

1. Extraia o ZIP. No computador que vai hospedar, use Node.js 18 ou mais recente.
2. Na pasta que contém `index.html`, execute `node server.cjs`. No Windows também pode abrir `Jogar.cmd`.
3. Abra `http://localhost:8000` no computador anfitrião. Nos outros computadores da mesma rede, abra o endereço indicado como **Na mesma rede** no terminal.
4. Cada jogador entra em seu perfil local. Um deles escolhe **Multiplayer → Criar sala**. Os outros abrem **Multiplayer → Entrar com código** e digitam os seis caracteres. Feche a janela Multiplayer e clique em **Jogar** ou **Continuar**.
5. Durante a partida, pressione **P → Multiplayer** para visitar uma fazenda ou enviar um presente. A sala comporta o anfitrião e três convidados. Mantenha o terminal e a aba do anfitrião abertos.

O servidor incluído transmite os dados por WebSocket. Jogo, fonte e bibliotecas vêm no ZIP. Se o Windows solicitar acesso à rede, permita na rede privada usada para jogar. A porta padrão é 8000 e pode ser alterada com a variável de ambiente `PORT`. Para jogadores em redes diferentes, hospede esse mesmo servidor em um serviço Node com HTTPS e suporte a WebSocket e compartilhe a URL. Todos os participantes precisam abrir o mesmo servidor.

## Controles

| Tecla | Acao |
|---|---|
| WASD / Shift | Mover / correr |
| Mouse / roda | Olhar / zoom |
| E ou clique | Interagir (plantar, regar, colher, abrir loja, construir) |
| 1 a 7 | Hotbar (1 Alface, 2 Morango, 3 Regador, 4 Milho, 5 Cogumelo, 6 Flor, 7 Melancia) |
| I | Inventario |
| G | Painel de drones |
| C | Contratos ativos |
| Q | Cancelar modo construcao |
| Esc ou P | Pausa (continuar, salvar, configuracoes, estatisticas, conquistas, sair) |

## Como jogar

- A fazenda fica a oeste, a cidade (Loja Geral e Mercado) a leste. A bomba de agua fica na fazenda, perto da Estacao de Drones.
- Compre sementes na Loja Geral, plante, regue e colha. Culturas mais avancadas demoram mais, gastam mais agua e valem mais.
- **Drones** (nivel 2): regam plantas, colhem sozinhos e consomem energia. Se ficarem sem energia, param; recupere-os no painel (G).
- **Construcoes e decoracoes** (Loja Geral): escolha "Posicionar" e mire no chao dentro da area destacada. Construcoes podem ser melhoradas com E.
- **Laboratorio**: gera pesquisa e abre a arvore de 9 tecnologias. Ganhe pontos colhendo, vendendo e concluindo contratos.
- **Fabrica**: transforma colheitas em produtos que valem mais.
- **Contratos**: aba "Contratos" do Mercado. Entregue itens ou cumpra metas para ganhar creditos, XP, sementes e cristais.
- **Eventos**: chuva, seca, tempestade solar, praga, mercado em alta, pedido urgente e meteorito de sementes. A pesquisa Estufa climatica e a Estacao meteorologica reduzem os efeitos ruins.
- **Reputacao**: vem de construcoes, decoracoes e contratos. Aumenta o preco de venda, os contratos e atrai visitantes que dao gorjetas.
- **Ilha Cristalina**: libera no nivel 8, por uma ponte ao norte da fazenda. Tem canteiros proprios, cristais e construcoes avancadas.

## Salvamento

O jogo salva sozinho a cada poucos segundos no navegador (localStorage, chave `fazenda-orbital-v3`). Saves da versao anterior sao migrados automaticamente.

## Estrutura

```
index.html  style.css  README.md
js/
  main.js       renderer, loop, qualidade grafica
  config.js     culturas, construcoes, pesquisas, eventos, contratos, conquistas
  state.js      estado, barramento de eventos, derivados e save/load
  ui.js         HUD, notificacoes, janelas, menus
  world.js      terreno, cidade, ilha, ponte e modelos 3D
  player.js     movimento, colisao, zoom
  game.js       canteiros, interacao, lojas, construcao, recursos, dia/noite, visitantes
  drones.js     drones e painel
  research.js   pesquisa e laboratorio
  contracts.js  missoes, contratos e conquistas
  events.js     eventos climaticos e de mercado
  audio.js      sons e musica procedurais
  effects.js    particulas, chuva e meteorito
```

## Atualizacao 4: desempenho, visual e novas mecanicas

**Desempenho**: sem luzes dinamicas (apenas sol e hemisferio), malhas estaticas fundidas (de ~218 para ~114 chamadas de desenho com tudo plantado), sombras atualizadas a cada 3 quadros, resolucao dinamica, matrizes congeladas e culling por distancia de canteiros, arvores e estruturas.

**Visual**: interface em vidro com gradientes, animacoes de janelas e linhas, icones coloridos nas lojas, hotbar paginada com cor por item.

**Mutacoes**: 5 tipos (Dourada, Gigante, Cristalina, Sombria, Arco-iris) sorteadas ao plantar; rendem itens especiais vendidos por mais. Pesquisa Genetica avancada aumenta a chance.

**Sementes**: 12 culturas (novas: Cenoura, Tomate, Uva, Abobora, Pimenta, Lotus).

**Arvores frutiferas**: 6 especies. Compre mudas na Loja Geral (aba Arvores), selecione na hotbar (Tab troca de pagina) e clique para plantar. Cada arvore madura produz frutos repetidamente; colha com E. Drones tambem regam e colhem arvores.

**Terreno**: Expansao do terreno (ate 32 canteiros), Solo fertil (crescimento e colheita dupla) e Pomar ampliado (limite de arvores).

**Irrigadores**: Aspersor, Gotejador inteligente (energia), Aspersor rotativo e Nuvem irrigadora (aba Irrigacao).

Controles novos: Tab troca a pagina da hotbar; 1 a 9 escolhem o item da pagina atual.

## Atualizacao 5: visual cartoon

- Sombreamento toon em 3 degraus (js/toon.js), cores mais saturadas e contorno escuro em canteiros, plantas, arvores, estruturas, cidade e drones.
- Caixas arredondadas (RoundedBox), copas e frutos mais redondos, ceu e grama mais vivos.
- Interface com contornos grossos e botoes estilo brinquedo.
- Qualidade Baixa desliga contornos e sombras (mais FPS).
- Custo: ~138 chamadas de desenho (antes 114) por causa dos contornos.
- Pasta assets/ guarda a referencia Blender; o jogo ainda gera os modelos por codigo.

## Atualizacao 6: casas novas, HUD limpo, contas e multiplayer

**Casas e lojas**: 4 casas redondas (domo com torre, torre em camadas, casa-ovo, estufa em cupula), Loja Geral como pavilhao com guarda-sol de babados e Mercado como barraca com toldo listrado. Sem caixas secas.

**HUD limpo**: so creditos, nivel, agua, energia e a meta ficam fixos. Drones, clima, contratos prontos, estoque cheio e sala aparecem so quando ha algo a mostrar. Hotbar compacta (nome do item aparece ao trocar). Ajuda de teclas some sozinha; H mostra/esconde.

**Contas**: nick (3 a 16 letras, numeros, _ ou -) e senha (minimo 4). Sem email. Cada conta tem o proprio save. A primeira conta criada herda o progresso salvo antes das contas. "Trocar de conta" fica no menu. Atencao: as contas ficam salvas no navegador (senha com PBKDF2 quando o navegador permite); o servidor de salas não armazena os perfis.

**Multiplayer**: menu Multiplayer (ou Pausa > Multiplayer).
- Criar sala: gera um codigo de 6 caracteres. Passe aos amigos.
- Entrar: digite o codigo.
- Até 6 jogadores. Cada um joga na propria fazenda; as fazendas dos outros aparecem em terrenos ao redor da cidade, com plantas, arvores e construcoes sincronizadas. Voce ve os outros jogadores andando pela cidade, com o nick acima da cabeca.
- Na hospedagem estática, o jogo utiliza WebRTC e a sinalização pública do PeerJS. O servidor incluído usa salas próprias e funciona inclusive em uma LAN sem internet.
- Teste local: abra duas abas com `index.html?net=local` (mesmo navegador) para simular a sala sem internet.

## Presentes entre amigos
Multiplayer > Dar presente (ao lado do nick do amigo): creditos, sementes, mudas, colheitas, frutos, mutantes, produtos e cristais. O item sai do seu inventario ao enviar e e devolvido se o amigo recusar (estoque cheio) ou sair da sala.

## Publicar na Vercel
Para a versão estática, selecione “Other”, deixe o comando de build vazio e use a pasta de `index.html` como raiz. Nesse modo, o botão Multiplayer usa a biblioteca PeerJS incluída e depende de sinalização pública e da rede dos jogadores. Para usar o servidor de salas incluído pela internet, publique o projeto em uma hospedagem Node persistente com o comando `node server.cjs`. Na versão estática, abra **Multiplayer → Servidor de salas**, informe a URL HTTPS dessa hospedagem e clique em **Aplicar** nos dois navegadores. Assim os jogadores da Vercel também podem usar o servidor de salas. Os dois modos de transporte têm salas independentes. Contas e saves continuam locais a cada navegador e endereço.

## Sala: relogio, clima e como achar amigos
- Dentro da sala todos seguem o relogio e o clima do host (dia/noite, chuva, seca e mercado em alta iguais para todos). Convidados nao sorteiam eventos proprios.
- Cada amigo aparece com nick visivel de longe e um facho de luz dourado. Os amigos aparecem na fazenda deles (leste, sul ou sudeste da cidade) ou na cidade, onde estiverem.
- Multiplayer > ao lado do nick: Dar presente, Ver fazenda (teleporta para a fazenda dele) e Ir ate ele.

## Update 7 - chuva e nuvens
- Chuva em shader (quads voltados a camera, queda por uniform de tempo): nao congela, nem em pausa/menu.
- Gotas coladas na camera somem (fade por distancia).
- Nuvens com brilho proprio a noite (antes ficavam escuras, viravam "barras pretas").

## Update 8 - grafico, eventos, login lembrado
- Novo `js/scenery.js`: ceu em degrade com sol, lua e entardecer; grama e flores ao vento; vagalumes a noite; borboletas e passaros de dia; arco-iris.
- Arvores novas (pinheiros e copas redondas ao vento no mundo; copas mais cheias nas arvores frutiferas).
- Bug corrigido: postes de luz e lampadas apareciam como barras e elipses flutuando (matriz reaproveitada).
- Eventos novos: Arco-iris (+25% crescimento), Festival da colheita (+25% preco), Mercador viajante (sementes gratis).
- Decoracoes novas animadas: Moinho de vento, Espantalho, Lago com lotus, Balao flutuante.
- Login: caixa "Manter conectado" (guarda nick + verificador, nunca a senha). "Trocar de conta" desliga. `?relogin` na URL forca a tela de login.
- O modo WebRTC da hospedagem estática precisa de internet para localizar a sala.

## Update 9
- Postes de luz agora ficam nas laterais da estrada (antes cruzavam a pista).
- Todas as 12 plantas refeitas com mais detalhe (folhas em camadas, sementes, caules, brilho, monte de terra).
- Itens redondos e mais detalhados: laboratorio, fabrica, bateria, banco, poste, fonte, canteiro decorativo.

## Update 10
- Casas: torres laterais afastadas das casas-domo, ovo e estufa (nao ficam mais coladas).
- Colisao: casas tinham raio 7,5; agora colisao justa por corpo. Construcoes e arvores com colisao menor.
- Grama nova (laminas curvas, escuras na base) e borboletas novas (4 asas, manchas, corpo, batida de asas).

## Pets (v3)
- Os 6 pets foram refeitos em estilo cartoon (cabecona, olhos grandes, bochechas, acessorios).
- Pets agora seguem a altura do chao (solo, praca, estrada, ilha) via `world.surfaceY`, entao nao afundam mais.

## Recompensa diaria e Album de colecao

- Recompensa diaria (`js/retention.js`): abre ao entrar no jogo quando ha premio. Sequencia de 7 dias (dia 7 = 1500 CR + 5 cristais); depois do dia 7 o ciclo repete com bonus de ate +100%. Perdeu dias? Ate 3 dias perdidos podem ser recuperados pagando 150 CR por dia de sequencia; senao recomeca do dia 1. Usa a data local do aparelho. Salvo em `state.daily`.
- Album de colecao: 5 abas (Plantas, Mutacoes, Frutas, Produtos, Pets) com contador "x/y coletados", espacos "???" para o que falta e bonus unico ao completar cada aba. Salvo em `state.album`; saves antigos sao preenchidos com o que o jogador ja possui.
- Acesso: menu de pausa (ESC), botoes "Recompensa diaria" e "Album de colecao". Eventos novos no bus: `craft`, `adopt`, `gameStart`.
- Saves antigos continuam validos (campos novos com valores padrao).

## Prestigio (Ascensao)

- Menu de pausa, botao "Prestigio" (`js/prestige.js`). A primeira ascensão exige nível 12. Cada prestígio aumenta o requisito em seis níveis.
- Ascender reinicia dinheiro, nivel, canteiros, estruturas, drones, pesquisas e estoque. Ficam: estrelas, melhorias, album, conquistas, pets, recompensa diaria e configuracoes. A pagina recarrega para recriar o mundo.
- Estrelas ganhas: raiz do faturamento da partida + bonus por nivel, +10% por ascensao anterior.
- 9 habilidades em três ramos (Cultivo, Engenharia e Comércio), com pré-requisitos e níveis permanentes (colheita, crescimento, preco de venda, mutacao, XP, agua, energia, dinheiro inicial, nivel inicial). Definidas em `CONFIG.prestige.perks`.
- 3 plantas exclusivas: Feijao prisma (1 ascensao), Girassol solar (2), Baga do vazio (3). Campo `prestige` em `CONFIG.crops`; modelos em `js/botany.js`, miniaturas em `assets/items`.
- Save: novo campo `prestige`, saves antigos continuam validos.
