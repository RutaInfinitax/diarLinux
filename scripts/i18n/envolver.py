#!/usr/bin/env python3
"""Envuelve textos en t('…') y agrega su traducción a src/shared/en.ts.

Uso: python3 scripts/i18n/envolver.py <archivo.ts(x)> <traducciones.tsv>
  traducciones.tsv: una línea por texto:  español<TAB>english
Casos: atributo="X" → atributo={t('X')} · 'X' / "X" → t('X') · >X< → >{t('X')}< · línea JSX con solo X → {t('X')}
"""
import os, re, sys

archivo, tsv = sys.argv[1], sys.argv[2]
pares = []
for linea in open(tsv, encoding='utf8'):
    linea = linea.rstrip('\n')
    if not linea.strip() or linea.startswith('#'):
        continue
    es, en = linea.split('\t')
    pares.append((es, en))

s = open(archivo, encoding='utf8').read()
def lit(x):
    return "t('" + x.replace('\\', '\\\\').replace("'", "\\'") + "')"

no = []
for es, en in pares:
    if es.startswith('='):  # solo diccionario (texto que se traduce al mostrarlo: t(variable))
        continue
    n = 0
    e = re.escape(es)
    # 1) atributo JSX
    s, k = re.subn(r'(\s[\w-]+)="' + e + '"', lambda m: m.group(1) + '={' + lit(es) + '}', s); n += k
    # 2) literal de código (no ya envuelto)
    s, k = re.subn(r"(?<!t\()(?<!tn\()(?<![\w.])'" + re.escape(es.replace("'", "\\'")) + "'", lit(es), s); n += k
    s, k = re.subn(r'(?<!t\()(?<![\w.=])"' + e + '"', lit(es), s); n += k
    # 3) texto entre etiquetas
    s, k = re.subn(r'>(\s*)' + e + r'(\s*)<', lambda m: '>' + m.group(1) + '{' + lit(es) + '}' + m.group(2) + '<', s); n += k
    # 4) línea JSX que es solo el texto
    s, k = re.subn(r'(?m)^(\s+)' + e + r'\s*$', lambda m: m.group(1) + '{' + lit(es) + '}', s); n += k
    if n == 0:
        no.append(es)

# import de t
if len(pares) - len(no) - sum(1 for e, _ in pares if e.startswith('=')) > 0 and not re.search(r"import \{[^}]*\bt\b[^}]*\} from '[./]*shared/i18n'", s):
    rel = os.path.relpath('src/shared/i18n', os.path.dirname(archivo))
    if not rel.startswith('.'):
        rel = './' + rel
    imp = f"import {{ t }} from '{rel}'\n"
    m = list(re.finditer(r"(?m)^import .*?from '.*?'\n", s))
    s = (s[:m[-1].end()] + imp + s[m[-1].end():]) if m else imp + s
open(archivo, 'w', encoding='utf8').write(s)

# diccionario
p = 'src/shared/en.ts'
d = open(p, encoding='utf8').read()
existentes = set(re.findall(r"^  (?:'((?:\\.|[^'])*)'|\"((?:\\.|[^\"])*)\"):", d, re.M))
ya = {a or b for a, b in existentes}
nuevas = ''
for es, en in pares:
    es = es[1:] if es.startswith('=') else es
    k = es.replace('\\', '\\\\').replace("'", "\\'")
    if k in ya or es in ya:
        continue
    nuevas += "  '" + k + "': '" + en.replace('\\', '\\\\').replace("'", "\\'") + "',\n"
    ya.add(k)
d = d.replace('\n}\n', '\n' + nuevas + '}\n', 1) if nuevas else d
d = d.replace('{\n\n', '{\n', 1)
open(p, 'w', encoding='utf8').write(d)
envolvibles = [e for e, _ in pares if not e.startswith('=')]
print(f'{archivo}: {len(envolvibles) - len(no)} de {len(envolvibles)} textos envueltos')
for x in no:
    print('  NO ENCONTRADO:', x)
