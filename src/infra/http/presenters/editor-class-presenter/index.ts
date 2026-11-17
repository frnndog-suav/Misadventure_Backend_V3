import type {
  TContentStatus,
  TEditorClass,
  TEditorClassSummary,
} from '@/domain/catalog/enterprise/value-objects/content'
import { ClassPresenter, type TClassDefinitionHttp } from '../class-presenter'

/** CONTRATO FEAT-06, tipo `EditorClass`. */
export interface TEditorClassHttp {
  status: TContentStatus
  classDefinition: TClassDefinitionHttp
}

/** CONTRATO FEAT-06, tipo `EditorClassSummary`. */
export interface TEditorClassSummaryHttp {
  playerClass: string
  name: string
  status: TContentStatus
}

export class EditorClassPresenter {
  static toHTTP(editorClass: TEditorClass): TEditorClassHttp {
    return {
      status: editorClass.status,
      classDefinition: ClassPresenter.toHTTP(editorClass.classDefinition),
    }
  }

  static toSummaryHTTP(summary: TEditorClassSummary): TEditorClassSummaryHttp {
    return {
      playerClass: summary.playerClass,
      name: summary.name,
      status: summary.status,
    }
  }
}
