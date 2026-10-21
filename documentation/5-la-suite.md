# 5 — La suite

[← la documentation](LISEZ-MOI.md)

## Où en est le projet

| Lot | État |
|---|---|
| 1 — connaître le terrain | fait : R1 et R2 levés, format consigné, langage arrêté |
| 2 — l'écran des sessions | fait |
| 3 — la ligne du temps | fait |
| 4 — les cartes | fait |
| 5 — le temps réel | fait |
| 6 — la carte de boucle | fait |

Les six lots du [cahier des charges](../CAHIER-DES-CHARGES.md) sont livrés, et ses critères
d'acceptation soldés. Ce qui suit n'est donc pas un reste à faire contractuel : c'est ce qui
manque encore pour voir **tout** ce qu'un agent fait.

## Ce qui est connu comme manquant

Ces points sont mesurés et assumés, pas oubliés. Chacun est redit à l'endroit où il se
constate, dans [les voies](4-les-voies.md).

| | |
|---|---|
| **Un hook qui refuse ne se distingue pas d'une règle qui refuse** | les deux portent `permission-rule`, et aucun champ ne les sépare. La carte dit « la raison n'est pas celle que rend une règle » et se garde de nommer l'auteur. |
| **Les hooks déclarés par un projet ne laissent aucune trace** | leur *effet* — le refus — est enregistré et montré ; leur exécution, non. Re-mesuré sur Claude Code 2.1.236 et signalé pour 2.1.301. |
| **La bande d'itérations ne dit pas si le réveil a eu lieu** | une case dit ce que le tour a produit, pas si le `ScheduleWakeup` qu'il a demandé a été suivi d'un `scheduled_task_fire`. Sur `819d3fef`, 27 des 173 relances n'ont jamais eu lieu. |
| **Un `Write` ne dit pas ce qu'il a remplacé** | ses lignes comptent en positif, le reste est inconnu. 131 suppressions restent non attribuées sur l'ensemble du corpus. |
| **Le contenu d'une réflexion n'est pas conservé** | seule sa signature l'est. On sait qu'elle a eu lieu et ce qu'elle a coûté, jamais ce qu'elle disait. |
| **L'économie de cache est muette en euros** | les tarifs employés sont des rapports, pas une monnaie : le transcript ne porte aucun prix. |
| **La palette sombre ne passe pas le contrôle de vision déficiente** | vert et ambre y sont à ΔE 0,8 en deutéranopie, sous le plancher. La palette claire, elle, est validée. Changer l'identité de l'application n'a pas été demandé — le fait est mesuré et consigné. |

## Ce que l'application ne sait pas encore montrer

La réserve complète, avec sa mise en scène possible, est dans
[`exemples/amélioration.md`](../exemples/amélioration.md). Quatre entrées s'y détachent,
parce qu'elles comblent un vide plutôt qu'elles n'ornent l'existant :

1. **Une boucle écrite exprès.** La voie existe et n'a jamais reçu une boucle propre, écrite
   pour être regardée.
2. **Le renvoi en cuisine** — un travail refait sur jugement. Rien ne le montre aujourd'hui,
   alors que c'est le cœur de ce qui distingue un agent d'un script.
3. **Un hook qui refuse.** Aucune trace n'en existe sur cette machine ; c'est le seul moyen
   de lever la réserve du tableau ci-dessus par la mesure plutôt que par le raisonnement.
4. **Un modèle qui n'est pas d'Anthropic.** Bedrock, Vertex et Foundry sont reconnus en
   natif par le client ; OpenRouter et les modèles locaux parlent l'API d'OpenAI et non
   `/v1/messages`, donc ils demandent un traducteur. Ce que la voie *appels au modèle*
   écrirait alors n'a jamais été mesuré.

Et, plus loin : l'orchestration scriptée, les messages entre agents, le mode plan, la
mémoire entre sessions, les ressources et prompts MCP, la même tâche confiée à N agents, la
reprise d'une session interrompue.

## La règle qui tient tout

Rien n'entre ici qui n'ait été **mesuré**. Une voie qui ne pourrait pas s'appuyer sur la
trace n'est pas dessinée ; une voie qui s'appuie sur une lecture partielle le dit. C'est
pourquoi cette page existe : un observateur qui tairait ses angles morts serait pire
qu'aucun observateur.

---

[← la documentation](LISEZ-MOI.md)
