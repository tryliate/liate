import crypto from 'node:crypto';

/**
 * [48] - LiateView (Sovereign Generative UI & Server-Driven Component Engine)
 * 
 * Enables AI agents to dynamically generate, stream, and render interactive UI widgets
 * (Cards, Tables, Forms, Stat Badges, Alerts, Action Buttons, and Charts) directly to
 * frontends (LiateWeb, React, Next.js, React Native, and HTML) with HITL action hooks.
 */

export type ViewComponentType = 
  | 'card' 
  | 'table' 
  | 'form' 
  | 'stat' 
  | 'alert' 
  | 'chart';

export interface ViewAction {
  id: string;
  label: string;
  type?: 'primary' | 'secondary' | 'danger' | 'success';
  payload?: Record<string, any>;
}

export interface ViewComponent<T = any> {
  id: string;
  type: ViewComponentType;
  props: T;
  actions?: ViewAction[];
  timestamp: number;
}

export interface CardProps {
  title: string;
  subtitle?: string;
  badge?: { text: string; color?: string };
  fields?: Array<{ label: string; value: any }>;
  actions?: ViewAction[];
}

export interface TableProps {
  title?: string;
  headers: string[];
  rows: (string | number)[][];
  actions?: ViewAction[];
}

export interface StatProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface AlertProps {
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
}

export interface FormProps {
  title: string;
  fields: Array<{
    name: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'boolean';
    options?: string[];
    required?: boolean;
  }>;
  submitLabel?: string;
}

export interface ChartProps {
  title: string;
  type: 'bar' | 'line' | 'pie';
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
}

export class LiateView {
  constructor() {}

  /**
   * Construct an interactive Card widget
   */
  public card(props: CardProps): ViewComponent<CardProps> {
    return this.createComponent('card', props, props.actions);
  }

  /**
   * Construct an interactive Data Table widget
   */
  public table(props: TableProps): ViewComponent<TableProps> {
    return this.createComponent('table', props, props.actions);
  }

  /**
   * Construct a Key Metric Stat widget
   */
  public stat(props: StatProps): ViewComponent<StatProps> {
    return this.createComponent('stat', props);
  }

  /**
   * Construct a Notification Alert widget
   */
  public alert(props: AlertProps): ViewComponent<AlertProps> {
    return this.createComponent('alert', props);
  }

  /**
   * Construct an Interactive Form widget
   */
  public form(props: FormProps): ViewComponent<FormProps> {
    return this.createComponent('form', props);
  }

  /**
   * Construct a Chart widget
   */
  public chart(props: ChartProps): ViewComponent<ChartProps> {
    return this.createComponent('chart', props);
  }

  /**
   * Render component to standalone HTML snippet for web clients
   */
  public renderHTML(component: ViewComponent): string {
    const { type, props } = component;

    if (type === 'card') {
      const cardProps = props as CardProps;
      const fieldsHtml = (cardProps.fields || []).map(f => `
        <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #222;">
          <span style="color:#888;">${f.label}</span>
          <strong style="color:#fff;">${f.value}</strong>
        </div>
      `).join('');

      const actionsHtml = (cardProps.actions || []).map(a => `
        <button data-action="${a.id}" style="margin-right:8px; padding:6px 12px; border-radius:4px; cursor:pointer; background:#f97316; color:#fff; border:none;">
          ${a.label}
        </button>
      `).join('');

      return `
        <div style="background:#111; border:1px solid #333; border-radius:8px; padding:16px; font-family:sans-serif; max-width:400px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0; color:#fff;">${cardProps.title}</h3>
            ${cardProps.badge ? `<span style="background:#f97316; padding:2px 8px; border-radius:4px; font-size:11px; color:#fff;">${cardProps.badge.text}</span>` : ''}
          </div>
          ${cardProps.subtitle ? `<p style="color:#aaa; font-size:13px; margin:4px 0 12px;">${cardProps.subtitle}</p>` : ''}
          <div style="margin:12px 0;">${fieldsHtml}</div>
          <div style="margin-top:12px;">${actionsHtml}</div>
        </div>
      `;
    }

    if (type === 'stat') {
      const statProps = props as StatProps;
      return `
        <div style="background:#111; border:1px solid #333; border-radius:8px; padding:16px; font-family:sans-serif; display:inline-block;">
          <div style="color:#888; font-size:12px;">${statProps.label}</div>
          <div style="color:#fff; font-size:24px; font-weight:bold; margin:4px 0;">${statProps.value}</div>
          ${statProps.change ? `<div style="color:#22c55e; font-size:12px;">${statProps.change}</div>` : ''}
        </div>
      `;
    }

    return `<div data-component="${type}" style="background:#111; color:#fff; padding:12px; border-radius:6px;">${JSON.stringify(props)}</div>`;
  }

  /**
   * Convert into autonomous Agent Tool for generating interactive UI widgets
   */
  public toTool() {
    return {
      name: 'render_interactive_ui',
      description: 'Renders an interactive UI component (Card, Table, Stat, or Alert) with buttons for human interaction',
      parameters: {
        type: 'object',
        properties: {
          componentType: { 
            type: 'string', 
            enum: ['card', 'table', 'stat', 'alert', 'form'],
            description: 'The type of UI component to render' 
          },
          props: { type: 'object', description: 'Component configuration properties' }
        },
        required: ['componentType', 'props']
      },
      execute: async (args: { componentType: ViewComponentType; props: any }) => {
        let component: ViewComponent;
        if (args.componentType === 'card') component = this.card(args.props);
        else if (args.componentType === 'table') component = this.table(args.props);
        else if (args.componentType === 'stat') component = this.stat(args.props);
        else if (args.componentType === 'alert') component = this.alert(args.props);
        else component = this.form(args.props);

        return {
          status: 'UI_RENDERED',
          componentId: component.id,
          type: component.type,
          component
        };
      }
    };
  }

  private createComponent<T>(type: ViewComponentType, props: T, actions?: ViewAction[]): ViewComponent<T> {
    return {
      id: `view_${type}_${crypto.randomBytes(4).toString('hex')}`,
      type,
      props,
      actions,
      timestamp: Date.now()
    };
  }
}

export const View = LiateView;
