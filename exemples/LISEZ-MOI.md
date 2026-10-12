# Exemples

Des kits autonomes, à déposer chacun dans un répertoire vide, qui produisent une session
Claude Code dont la ligne du temps **montre quelque chose**. Ce ne sont pas des morceaux
de Claude N Works : c'est de la matière à observer avec.

| Kit | Ce qu'il met en évidence |
|---|---|
| [`cuisine/`](cuisine/LISEZ-MOI.md) | l'orchestration : un arbre à trois étages, des postes en parallèle, une barrière, quatre tempéraments d'agent — et un serveur MCP, le livre de recettes, que le chef et les commis consultent chacun pour leur part |

[`amélioration.md`](amélioration.md) tient la réserve : les éléments de l'agentique qu'un
prochain kit pourrait mettre en scène, avec, pour chacun, ce que l'application sait déjà
en montrer et ce qui lui manquerait.

La marche à suivre est la même pour tous : copier le contenu du kit — **point final
compris**, sinon `.claude/` reste derrière — dans un répertoire vide, y lancer `claude`,
donner la phrase d'entrée indiquée, et regarder la session depuis `node serveur.js`.
