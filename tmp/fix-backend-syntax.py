from pathlib import Path
path = Path('src/modules/empresa-configuracion/empresa-configuracion.service.ts')
source = path.read_text(encoding='utf-8')
source = source.replace("input.vinculacion_activa == None", "input.vinculacion_activa === null || input.vinculacion_activa === undefined")
source = source.replace("input.without_category == True ? True : undefined", "input.without_category === true ? true : undefined")
source = source.replace("input.institucion_sede_count.operator == 'BETWEEN'", "input.institucion_sede_count.operator === 'BETWEEN'")
path.write_text(source, encoding='utf-8')
