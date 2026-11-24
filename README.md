# Fazenda Orbital

Jogo 3D em primeira pessoa, low-poly, que roda direto no navegador (Three.js via CDN).
Abra pelo servidor local (recomendado, por causa dos modulos ES):

```
cd fazenda-orbital
python3 -m http.server 8000
```

e acesse http://localhost:8000. Na primeira abertura e necessaria internet (Three.js e a fonte vem de CDN).

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

**Contas**: nick (3 a 16 letras, numeros, _ ou -) e senha (minimo 4). Sem email. Cada conta tem o proprio save. A primeira conta criada herda o progresso salvo antes das contas. "Trocar de conta" fica no menu. Atencao: as contas ficam salvas no navegador (senha com PBKDF2 quando o navegador permite); nao ha servidor nem recuperacao de senha.

**Multiplayer**: menu Multiplayer (ou Pausa > Multiplayer).
- Criar sala: gera um codigo de 6 caracteres. Passe aos amigos.
- Entrar: digite o codigo.
- Ate 4 jogadores. Cada um joga na propria fazenda; as fazendas dos outros aparecem em terrenos ao redor da cidade (leste, sul e sudeste), com plantas, arvores e construcoes sincronizadas. Voce ve os outros jogadores andando pela cidade, com o nick acima da cabeca.
- Conexao direta entre navegadores (WebRTC via PeerJS, carregado do unpkg; usa o servidor publico de sinalizacao do PeerJS). Em redes muito restritivas pode falhar.
- Teste local: abra duas abas com `index.html?net=local` (mesmo navegador) para simular a sala sem internet.

## Presentes entre amigos
Multiplayer > Dar presente (ao lado do nick do amigo): creditos, sementes, mudas, colheitas, frutos, mutantes, produtos e cristais. O item sai do seu inventario ao enviar e e devolvido se o amigo recusar (estoque cheio) ou sair da sala.

## Publicar na Vercel
O jogo e estatico (sem build). Suba a pasta como esta e use "Other / no framework", sem comando de build, diretorio de saida na raiz. Em HTTPS o hash de senha usa PBKDF2 e o WebRTC funciona normalmente. O PeerJS agora vem junto em js/vendor/peerjs.min.js (usa o servidor publico de sinalizacao 0.peerjs.com e os servidores STUN/TURN publicos do PeerJS). Contas e saves ficam no navegador de cada jogador (localStorage por dominio), nao sincronizam entre aparelhos.

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
- Multiplayer: usa o servidor publico de sinalizacao do PeerJS; os jogadores precisam de internet para conectar (depois o trafego e direto entre eles, mesma rede ou nao).

## Update 9
- Postes de luz agora ficam nas laterais da estrada (antes cruzavam a pista).
- Todas as 12 plantas refeitas com mais detalhe (folhas em camadas, sementes, caules, brilho, monte de terra).
- Itens redondos e mais detalhados: laboratorio, fabrica, bateria, banco, poste, fonte, canteiro decorativo.

## Update 10
- Casas: torres laterais afastadas das casas-domo, ovo e estufa (nao ficam mais coladas).
- Colisao: casas tinham raio 7,5; agora colisao justa por corpo. Construcoes e arvores com colisao menor.
- Grama nova (laminas curvas, escuras na base) e borboletas novas (4 asas, manchas, corpo, batida de asas).
