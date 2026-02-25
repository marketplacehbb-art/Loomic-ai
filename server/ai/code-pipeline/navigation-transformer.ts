import { Project, SyntaxKind, JsxOpeningElement, JsxSelfClosingElement } from 'ts-morph';

/**
 * Navigation Transformer Pipeline Step
 * Prevents "Inception Bug" by converting links to state updates
 */
export class NavigationTransformer {
    private static instance: NavigationTransformer;
    private project: Project;

    private constructor() {
        this.project = new Project({
            useInMemoryFileSystem: true,
            compilerOptions: {
                skipLibCheck: true
            }
        });
    }

    public static getInstance(): NavigationTransformer {
        if (!NavigationTransformer.instance) {
            NavigationTransformer.instance = new NavigationTransformer();
        }
        return NavigationTransformer.instance;
    }

    /**
     * Transform navigation elements to safe state updates
     */
    public transform(code: string): string {
        const sourceFile = this.project.createSourceFile('temp_nav.tsx', code, { overwrite: true });

        // 1. Transform <a> tags
        sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement).forEach(element => {
            this.processAnchorTag(element);
        });

        // Also check self-closing tags (rare for anchors but possible)
        sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).forEach(element => {
            this.processAnchorTag(element);
        });

        // 2. Transform React Router <Link>
        this.transformRouterLinks(sourceFile);

        return sourceFile.getFullText();
    }

    /**
     * Process generic JsxElement (Opening or SelfClosing) looking for <a>
     */
    private processAnchorTag(element: JsxOpeningElement | JsxSelfClosingElement) {
        if (element.getTagNameNode().getText() !== 'a') return;

        const hrefAttrLike = element.getAttribute('href');
        if (!hrefAttrLike) return;

        // Type Check: Ensure it is a JsxAttribute (key="value") and not a SpreadAttribute ({...props})
        const hrefAttr = hrefAttrLike.asKind(SyntaxKind.JsxAttribute);
        if (!hrefAttr) return;

        const initializer = hrefAttr.getInitializer();
        const hrefLiteral = initializer?.asKind(SyntaxKind.StringLiteral);
        if (!hrefLiteral) return; // Only handle static string hrefs for safety

        const updatedHref = hrefLiteral.getLiteralValue();

        // Ignore external links (http/https/mailto/tel) and internal anchors (#)
        if (updatedHref.startsWith('http') || updatedHref.startsWith('mailto:') || updatedHref.startsWith('tel:') || updatedHref.startsWith('#')) {
            return;
        }

        // Convert to relative path logic
        const viewName = updatedHref.replace(/^\//, '') || 'home';

        // 1. Change href to "#" to prevent navigation
        hrefAttr.setInitializer('"#"');

        // 2. Add onClick handler
        // Check if onClick already exists
        const onClickAttr = element.getAttribute('onClick');
        if (onClickAttr) {
            // Complex case: append logic? For now, just warn and skip to avoid breaking existing logic
            return;
        }

        element.addAttribute({
            name: 'onClick',
            initializer: `{(e) => { e.preventDefault(); setView('${viewName}'); }}`
        });
    }

    /**
     * Transform <Link to="..."> to <button onClick="...">
     */
    private transformRouterLinks(sourceFile: any) {
        // Determine if we need to clean up imports later
        let foundLinks = false;

        // Find all <Link> elements
        const links = [
            ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
            ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
        ].filter((el: any) => el.getTagNameNode().getText() === 'Link');

        links.forEach((link: JsxOpeningElement | JsxSelfClosingElement) => {
            foundLinks = true;
            const toAttrLike = link.getAttribute('to');
            if (!toAttrLike) return;

            const toAttr = toAttrLike.asKind(SyntaxKind.JsxAttribute);
            if (!toAttr) return;

            const initializer = toAttr.getInitializer();
            let viewName = 'home';

            const toLiteral = initializer?.asKind(SyntaxKind.StringLiteral);
            if (toLiteral) {
                viewName = toLiteral.getLiteralValue().replace(/^\//, '') || 'home';
            } else if (initializer && initializer.asKind(SyntaxKind.JsxExpression)) {
                // dynamic path - hard to handle safely without runtime logic
                return;
            }

            // Rename component to 'button' (or 'a' if styling consistency required, but button is safer for onClick)
            // Using 'a' with href="#" closely mimics Link behavior visually
            link.getTagNameNode().replaceWithText('a');

            // If it has a closing tag, rename that too
            if (link.getKind() === SyntaxKind.JsxOpeningElement) {
                const parent = link.getParent();
                if (parent && parent.getKind() === SyntaxKind.JsxElement) {
                    // Safely get closing element tag name
                    const closingElement = (parent as any).getClosingElement();
                    if (closingElement) {
                        closingElement.getTagNameNode().replaceWithText('a');
                    }
                }
            }

            // Replace 'to' with 'href="#"' AND 'onClick'
            toAttr.remove();

            link.addAttribute({ name: 'href', initializer: '"#"' });
            link.addAttribute({
                name: 'onClick',
                initializer: `{(e) => { e.preventDefault(); setView('${viewName}'); }}`
            });
        });

        if (foundLinks) {
            // Remove Link import
            const importDecl = sourceFile.getImportDeclaration(
                (decl: any) => decl.getModuleSpecifierValue() === 'react-router-dom'
            );
            if (importDecl) {
                const namedImports = importDecl.getNamedImports();
                const linkImport = namedImports.find((ni: any) => ni.getName() === 'Link');
                if (linkImport) linkImport.remove();

                // If empty, remove whole import
                if (importDecl.getNamedImports().length === 0) {
                    importDecl.remove();
                }
            }
        }
    }
}

export const navigationTransformer = NavigationTransformer.getInstance();
