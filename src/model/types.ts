import type { Edge, Node } from '@xyflow/react'
import type { CardData, EdgeData, GroupData, ShapeData, TextData } from './schema'

export type CardNodeType = Node<CardData, 'card'>
export type ShapeNodeType = Node<ShapeData, 'shape'>
export type TextNodeType = Node<TextData, 'text'>
export type GroupNodeType = Node<GroupData, 'group'>

export type DiagramNode = CardNodeType | ShapeNodeType | TextNodeType | GroupNodeType
export type DiagramEdge = Edge<EdgeData, 'flow'>
