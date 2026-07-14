import fs from 'fs'
import path from 'path'
import { fillTemplate, type TemplateData } from './templates'

function readTemplate(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'templates', name), 'utf8')
}

export function buildReadmeText(d: TemplateData): string {
  return fillTemplate(readTemplate('readme.txt'), d)
}

export function buildEtsyText(d: TemplateData): string {
  return fillTemplate(readTemplate('etsy.txt'), d)
}
